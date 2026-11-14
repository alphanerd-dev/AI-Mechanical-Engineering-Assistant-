#!/usr/bin/env python3
"""Authenticated HTTP boundary for the isolated OpenFOAM 14 CFD worker."""

from __future__ import annotations

import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from artifacts import persist_case_artifacts, prune_artifacts
from errors import WorkerError, WorkerTimeout
from manifest import validate_request, write_case
from solver import (
    detect_openfoam_version as detect_runtime_version,
    final_residuals,
    integrate_mass_flux,
    last_probe_values,
    latest_time_directory,
    parse_mesh_cell_count,
    run_tool as run_openfoam_tool,
)

HOST = os.environ.get("OPENFOAM_WORKER_HOST", "0.0.0.0")
PORT = int(os.environ.get("OPENFOAM_WORKER_PORT", "8080"))
ARTIFACT_ROOT = Path(os.environ.get("OPENFOAM_ARTIFACT_DIR", "/artifacts"))
FOAM_ENV = "/usr/local/bin/foam-env"
MAX_BODY_BYTES = 16 * 1024
ARTIFACT_NAMES = {
    "mesh.tar.gz",
    "velocity-field.tar.gz",
    "pressure-field",
    "solver.log",
}
WORKER_TOKEN = os.environ.get("OPENFOAM_WORKER_TOKEN", "")
FOAM_VERSION = "unverified"


def detect_openfoam_version() -> str:
    return detect_runtime_version(FOAM_ENV)


def run_tool(
    case_dir: Path,
    tool: str,
    timeout: float,
) -> subprocess.CompletedProcess[str]:
    return run_openfoam_tool(case_dir, tool, timeout, FOAM_ENV)


def run_case_tools(
    case_dir: Path,
    request: dict[str, Any],
    started: float,
    timeout: int,
) -> tuple[list[str], int]:
    logs: list[str] = []
    actual_mesh_cells = 0
    for tool in ("blockMesh", "checkMesh", "foamRun"):
        remaining = timeout - (time.monotonic() - started)
        if remaining <= 0:
            raise subprocess.TimeoutExpired(tool, timeout)
        completed = run_tool(case_dir, tool, remaining)
        output = completed.stdout + completed.stderr
        logs.append(f"===== {tool} =====\n{output}\n")
        (case_dir / f"log.{tool}").write_text(output, encoding="utf-8")
        if completed.returncode != 0:
            raise WorkerError(f"{tool} failed with exit code {completed.returncode}.")
        if tool == "checkMesh":
            if "Mesh OK" not in output:
                raise WorkerError("OpenFOAM checkMesh did not report Mesh OK.")
            actual_mesh_cells = parse_mesh_cell_count(output)
            if actual_mesh_cells != int(request["mesh"]["cellsVertical"]):
                raise WorkerError("OpenFOAM checkMesh cell count does not match the requested mesh.")
    return logs, actual_mesh_cells


def collect_case_results(
    case_dir: Path,
    request: dict[str, Any],
    y_samples: list[float],
    solver_log: str,
) -> dict[str, Any]:
    residuals = final_residuals(solver_log)
    tolerance = float(request["solver"]["residualTolerance"])
    converged = residuals["pressure"] <= tolerance and residuals["velocity"] <= tolerance
    if "End" not in solver_log:
        raise WorkerError("OpenFOAM solver did not reach a normal End marker.")

    probe_candidates = list(case_dir.glob("postProcessing/**/U"))
    if not probe_candidates:
        raise WorkerError("OpenFOAM did not create the requested velocity-profile probes.")
    probe_file = probe_candidates[0]
    velocities = last_probe_values(probe_file, len(y_samples))
    profile = [
        {"yM": y, "axialVelocityMps": velocity}
        for y, velocity in zip(y_samples, velocities)
    ]
    mass_flux = integrate_mass_flux(
        y_samples,
        velocities,
        float(request["heightM"]),
        float(request["depthM"]),
        float(request["densityKgM3"]),
    )
    return {
        "residuals": residuals,
        "converged": converged,
        "profile": profile,
        "massFluxKgS": mass_flux,
        "probeFile": probe_file,
        "finalDirectory": latest_time_directory(case_dir),
    }


def persist_case_artifacts(
    artifact_dir: Path,
    case_dir: Path,
    case_results: dict[str, Any],
    logs: list[str],
) -> list[dict[str, str]]:
    with tarfile.open(artifact_dir / "mesh.tar.gz", "w:gz") as archive:
        archive.add(case_dir / "constant" / "polyMesh", arcname="polyMesh")

    with tarfile.open(artifact_dir / "velocity-field.tar.gz", "w:gz") as archive:
        archive.add(case_results["finalDirectory"] / "U", arcname="U")
        archive.add(case_results["probeFile"], arcname="velocity-profile")

    shutil.copy2(case_results["finalDirectory"] / "p", artifact_dir / "pressure-field")
    (artifact_dir / "solver.log").write_text("\n".join(logs), encoding="utf-8")
    return [
        make_artifact(artifact_dir, "MESH", "mesh.tar.gz", "application/gzip"),
        make_artifact(artifact_dir, "VELOCITY_FIELD", "velocity-field.tar.gz", "application/gzip"),
        make_artifact(artifact_dir, "PRESSURE_FIELD", "pressure-field", "text/plain"),
        make_artifact(artifact_dir, "SOLVER_LOG", "solver.log", "text/plain"),
    ]


def execute_case(request: dict[str, Any]) -> dict[str, Any]:
    prune_artifacts(ARTIFACT_ROOT)
    job_id = uuid.uuid4().hex
    artifact_dir = ARTIFACT_ROOT / job_id
    artifact_dir.mkdir(parents=True, exist_ok=False)
    timeout = int(request["solver"]["timeoutSeconds"])
    started = time.monotonic()

    try:
        with tempfile.TemporaryDirectory(prefix="openfoam14-", dir="/tmp") as temporary:
            case_dir = Path(temporary) / "case"
            case_dir.mkdir()
            y_samples = write_case(case_dir, request)
            logs, actual_mesh_cells = run_case_tools(case_dir, request, started, timeout)
            case_results = collect_case_results(case_dir, request, y_samples, logs[-1])
            artifacts = persist_case_artifacts(artifact_dir, case_dir, case_results, logs)
            converged = case_results["converged"]
            return {
                "jobId": job_id,
                "status": "COMPLETED",
                "solver": "OpenFOAM",
                "solverVersion": FOAM_VERSION,
                "converged": converged,
                "meshCells": actual_mesh_cells,
                "massFluxKgS": case_results["massFluxKgS"],
                "residuals": case_results["residuals"],
                "velocityProfile": case_results["profile"],
                "artifacts": artifacts,
                "warnings": [] if converged else ["Solver completed but final residuals exceed the requested tolerance."],
            }
    except subprocess.TimeoutExpired as error:
        shutil.rmtree(artifact_dir, ignore_errors=True)
        raise WorkerTimeout("OpenFOAM execution exceeded the requested wall-clock timeout.") from error
    except Exception:
        shutil.rmtree(artifact_dir, ignore_errors=True)
        raise


class Handler(BaseHTTPRequestHandler):
    server_version = "OpenFOAM14Worker/0.1"

    def _authorized(self) -> bool:
        if not WORKER_TOKEN:
            return False
        supplied = self.headers.get("Authorization", "")
        expected = f"Bearer {WORKER_TOKEN}"
        return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))

    def _send_bytes(self, status: int, payload: bytes, media_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", media_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"ready": True, "solver": "OpenFOAM", "solverVersion": "14"})
            return
        if self.path.startswith("/v1/cfd/artifacts/"):
            if not self._authorized():
                self._send_json(401, {"error": "Unauthorized."})
                return
            parts = [unquote(part) for part in urlsplit(self.path).path.split("/") if part]
            if len(parts) != 5 or parts[:3] != ["v1", "cfd", "artifacts"]:
                self._send_json(404, {"error": "Not found."})
                return
            job_id, filename = parts[3], parts[4]
            if not re.fullmatch(r"[a-f0-9]{32}", job_id) or filename not in ARTIFACT_NAMES:
                self._send_json(404, {"error": "Not found."})
                return
            artifact_path = (ARTIFACT_ROOT / job_id / filename).resolve()
            expected_parent = (ARTIFACT_ROOT / job_id).resolve()
            if artifact_path.parent != expected_parent or not artifact_path.is_file():
                self._send_json(404, {"error": "Not found."})
                return
            media_type = "application/gzip" if filename.endswith(".gz") else "text/plain"
            self._send_bytes(200, artifact_path.read_bytes(), media_type)
            return
        self._send_json(404, {"error": "Not found."})

    def do_POST(self) -> None:
        if self.path != "/v1/cfd/laminar-channel":
            self._send_json(404, {"error": "Not found."})
            return
        if not self._authorized():
            self._send_json(401, {"error": "Unauthorized."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                self._send_json(413, {"error": "Request body must be between 1 byte and 16 KiB."})
                return
            data = json.loads(self.rfile.read(length))
            errors = validate_request(data)
            if errors:
                self._send_json(400, {"error": "Invalid CFD manifest.", "details": errors})
                return
            result = execute_case(data)
            self._send_json(200, result)
        except WorkerTimeout as error:
            self._send_json(504, {"error": str(error)})
        except WorkerError as error:
            self._send_json(422, {"error": str(error)})
        except Exception:
            self._send_json(500, {"error": "OpenFOAM worker failed unexpectedly."})

    def log_message(self, format_string: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), format_string % args), flush=True)


def main() -> None:
    global FOAM_VERSION
    if not WORKER_TOKEN:
        raise RuntimeError("OPENFOAM_WORKER_TOKEN must be configured before the worker starts.")
    Path.home().mkdir(parents=True, exist_ok=True)
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    FOAM_VERSION = detect_openfoam_version()
    server = HTTPServer((HOST, PORT), Handler)
    print(f"OpenFOAM 14 worker listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

