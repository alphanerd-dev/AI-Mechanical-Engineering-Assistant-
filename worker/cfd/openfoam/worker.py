#!/usr/bin/env python3
"""Bounded OpenFOAM 14 half-channel Poiseuille benchmark worker."""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

HOST = os.environ.get("OPENFOAM_WORKER_HOST", "0.0.0.0")
PORT = int(os.environ.get("OPENFOAM_WORKER_PORT", "8080"))
ARTIFACT_ROOT = Path(os.environ.get("OPENFOAM_ARTIFACT_DIR", "/artifacts"))
FOAM_ENV = "/usr/local/bin/foam-env"
NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
MAX_BODY_BYTES = 16 * 1024
ARTIFACT_NAMES = {
    "mesh.tar.gz",
    "velocity-field.tar.gz",
    "pressure-field",
    "solver.log",
}
WORKER_TOKEN = os.environ.get("OPENFOAM_WORKER_TOKEN", "")


class WorkerError(Exception):
    pass


class WorkerTimeout(WorkerError):
    pass


def finite_positive(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def validate_request(data: Any) -> list[str]:
    if not isinstance(data, dict):
        return ["Request body must be a JSON object."]
    errors: list[str] = []
    allowed_keys = {
        "caseId", "meanVelocityMps", "heightM", "depthM", "densityKgM3",
        "kinematicViscosityM2PerS", "mesh", "solver"
    }
    if set(data) - allowed_keys:
        errors.append("Request contains unsupported fields.")
    if data.get("caseId") != "laminar-channel-poiseuille-v1":
        errors.append("Unsupported caseId.")
    for field in ("meanVelocityMps", "heightM", "depthM", "densityKgM3", "kinematicViscosityM2PerS"):
        if not finite_positive(data.get(field)):
            errors.append(f"{field} must be finite and positive.")

    if all(finite_positive(data.get(field)) for field in (
        "meanVelocityMps", "heightM", "kinematicViscosityM2PerS"
    )):
        reynolds = 2 * data["heightM"] * data["meanVelocityMps"] / data["kinematicViscosityM2PerS"]
        if not math.isfinite(reynolds) or reynolds >= 1000:
            errors.append("Hydraulic-diameter Reynolds number must be below 1000.")

    mesh = data.get("mesh")
    if isinstance(mesh, dict) and set(mesh) - {"cellsVertical"}:
        errors.append("mesh contains unsupported fields.")
    cells = mesh.get("cellsVertical") if isinstance(mesh, dict) else None
    if not isinstance(cells, int) or isinstance(cells, bool) or not 20 <= cells <= 200:
        errors.append("mesh.cellsVertical must be an integer between 20 and 200.")

    solver = data.get("solver")
    if not isinstance(solver, dict):
        errors.append("solver must be an object.")
        solver = {}
    elif set(solver) - {"maxIterations", "residualTolerance", "timeoutSeconds"}:
        errors.append("solver contains unsupported fields.")
    iterations = solver.get("maxIterations")
    if not isinstance(iterations, int) or isinstance(iterations, bool) or not 50 <= iterations <= 10000:
        errors.append("solver.maxIterations must be an integer between 50 and 10000.")
    tolerance = solver.get("residualTolerance")
    if isinstance(tolerance, bool) or not isinstance(tolerance, (int, float)) or not math.isfinite(tolerance) or not 1e-10 <= tolerance <= 1e-3:
        errors.append("solver.residualTolerance must be between 1e-10 and 1e-3.")
    timeout = solver.get("timeoutSeconds")
    if not isinstance(timeout, int) or isinstance(timeout, bool) or not 5 <= timeout <= 600:
        errors.append("solver.timeoutSeconds must be an integer between 5 and 600.")
    return errors


def foam_header(object_name: str, location: str, class_name: str) -> str:
    return f'''FoamFile
{{
    format      ascii;
    class       {class_name};
    location    "{location}";
    object      {object_name};
}}
'''


def write_case(case_dir: Path, request: dict[str, Any]) -> list[float]:
    height = float(request["heightM"])
    depth = float(request["depthM"])
    viscosity = float(request["kinematicViscosityM2PerS"])
    mean_velocity = float(request["meanVelocityMps"])
    cells = int(request["mesh"]["cellsVertical"])
    tolerance = float(request["solver"]["residualTolerance"])
    iterations = int(request["solver"]["maxIterations"])
    half_height = height / 2.0
    streamwise_length = height
    body_force = 12.0 * viscosity * mean_velocity / (height * height)
    y_samples = [(index + 0.5) * half_height / cells for index in range(cells)]

    for folder in ("0", "constant", "system"):
        (case_dir / folder).mkdir(parents=True, exist_ok=True)

    block_mesh = f'''{foam_header("blockMeshDict", "system", "dictionary")}
scale 1;

vertices
(
    ({-streamwise_length/2:.12g} 0 {-depth/2:.12g})
    ({streamwise_length/2:.12g} 0 {-depth/2:.12g})
    ({streamwise_length/2:.12g} {half_height:.12g} {-depth/2:.12g})
    ({-streamwise_length/2:.12g} {half_height:.12g} {-depth/2:.12g})
    ({-streamwise_length/2:.12g} 0 {depth/2:.12g})
    ({streamwise_length/2:.12g} 0 {depth/2:.12g})
    ({streamwise_length/2:.12g} {half_height:.12g} {depth/2:.12g})
    ({-streamwise_length/2:.12g} {half_height:.12g} {depth/2:.12g})
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (1 {cells} 1) simpleGrading (1 1 1)
);

boundary
(
    left
    {{
        type cyclic;
        neighbourPatch right;
        faces ((0 3 7 4));
    }}
    right
    {{
        type cyclic;
        neighbourPatch left;
        faces ((1 2 6 5));
    }}
    wall
    {{
        type wall;
        faces ((0 1 5 4));
    }}
    centreline
    {{
        type symmetryPlane;
        faces ((2 3 7 6));
    }}
    frontAndBack
    {{
        type empty;
        faces ((0 1 2 3) (4 5 6 7));
    }}
);
'''
    (case_dir / "system" / "blockMeshDict").write_text(block_mesh, encoding="utf-8")

    (case_dir / "0" / "U").write_text(
        foam_header("U", "0", "volVectorField")
        + '''dimensions      [velocity];
internalField   uniform (0 0 0);
boundaryField
{
    wall
    {
        type fixedValue;
        value uniform (0 0 0);
    }
    #includeEtc "caseDicts/setConstraintTypes"
}
''',
        encoding="utf-8",
    )
    (case_dir / "0" / "p").write_text(
        foam_header("p", "0", "volScalarField")
        + '''dimensions      [kinematicPressure];
internalField   uniform 0;
boundaryField
{
    wall
    {
        type zeroGradient;
    }
    #includeEtc "caseDicts/setConstraintTypes"
}
''',
        encoding="utf-8",
    )
    (case_dir / "constant" / "physicalProperties").write_text(
        foam_header("physicalProperties", "constant", "dictionary")
        + f"viscosityModel constant;\nnu {viscosity:.12g};\n",
        encoding="utf-8",
    )
    (case_dir / "constant" / "momentumTransport").write_text(
        foam_header("momentumTransport", "constant", "dictionary")
        + "simulationType laminar;\n",
        encoding="utf-8",
    )
    (case_dir / "constant" / "fvModels").write_text(
        foam_header("fvModels", "constant", "dictionary")
        + f'''momentumSource
{{
    type semiImplicitSource;
    cellZone all;
    volumeMode specific;
    sources
    {{
        U
        {{
            explicit ({body_force:.12g} 0 0);
            implicit 0;
        }}
    }}
}}
''',
        encoding="utf-8",
    )
    (case_dir / "system" / "controlDict").write_text(
        foam_header("controlDict", "system", "dictionary")
        + f'''solver incompressibleFluid;
startFrom startTime;
startTime 0;
stopAt endTime;
endTime {iterations};
deltaT 1;
writeControl timeStep;
writeInterval 1;
purgeWrite 1;
writeFormat ascii;
writePrecision 12;
writeCompression off;
timeFormat general;
timePrecision 6;
runTimeModifiable false;
#include "functions"
''',
        encoding="utf-8",
    )
    (case_dir / "system" / "fvSchemes").write_text(
        foam_header("fvSchemes", "system", "dictionary")
        + '''ddtSchemes
{
    default steadyState;
}
gradSchemes
{
    default Gauss linear;
}
divSchemes
{
    default none;
    div(phi,U) bounded Gauss linearUpwind grad(U);
    div((nu*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes
{
    default Gauss linear uncorrected;
}
interpolationSchemes
{
    default linear;
}
snGradSchemes
{
    default uncorrected;
}
''',
        encoding="utf-8",
    )
    (case_dir / "system" / "fvSolution").write_text(
        foam_header("fvSolution", "system", "dictionary")
        + f'''solvers
{{
    p
    {{
        solver GAMG;
        smoother DIC;
        tolerance {tolerance:.12g};
        relTol 0;
    }}
    U
    {{
        solver smoothSolver;
        smoother symGaussSeidel;
        tolerance {tolerance:.12g};
        relTol 0;
    }}
}}
SIMPLE
{{
    nNonOrthogonalCorrectors 0;
    consistent yes;
    residualControl
    {{
        p {tolerance:.12g};
        U {tolerance:.12g};
    }}
}}
relaxationFactors
{{
    equations
    {{
        U 0.9;
        ".*" 0.9;
    }}
}}
''',
        encoding="utf-8",
    )
    points = " ".join(f"(0 {y:.12g} 0)" for y in y_samples)
    (case_dir / "system" / "functions").write_text(
        f'''#includeFunc residuals(p,U)
#includeFunc probes(name=velocityProfile, points=({points}), U)
''',
        encoding="utf-8",
    )
    return y_samples


def run_tool(case_dir: Path, tool: str, timeout: float) -> subprocess.CompletedProcess[str]:
    if tool not in {"blockMesh", "checkMesh", "foamRun"}:
        raise WorkerError("Unsupported OpenFOAM utility.")
    return subprocess.run(
        [FOAM_ENV, tool, "-case", str(case_dir)],
        cwd=case_dir,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        env={**os.environ, "OMP_NUM_THREADS": "1", "FOAM_SIGFPE": "1", "FOAM_SETNAN": "1"},
    )


def last_probe_values(probe_file: Path, expected_samples: int) -> list[float]:
    if not probe_file.is_file():
        raise WorkerError("OpenFOAM velocity probe output is missing.")
    data_lines = [
        line.strip()
        for line in probe_file.read_text(encoding="utf-8", errors="replace").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not data_lines:
        raise WorkerError("OpenFOAM velocity probe output contains no samples.")
    values = [float(value) for value in NUMBER.findall(data_lines[-1])]
    expected_count = 1 + 3 * expected_samples
    if len(values) < expected_count:
        raise WorkerError("OpenFOAM velocity probe output has an unexpected column count.")
    return [values[1 + index * 3] for index in range(expected_samples)]


def final_residuals(log_text: str) -> dict[str, float]:
    p_matches = re.findall(
        r"Solving for p, Initial residual = [^,]+, Final residual = (" + NUMBER.pattern + r")",
        log_text,
    )
    u_matches = re.findall(
        r"Solving for U[xyz], Initial residual = [^,]+, Final residual = (" + NUMBER.pattern + r")",
        log_text,
    )
    if not p_matches or not u_matches:
        raise WorkerError("Could not extract final pressure and velocity residuals from the solver log.")
    return {
        "pressure": float(p_matches[-1]),
        "velocity": max(float(value) for value in u_matches[-3:]),
    }


def integrate_mass_flux(y_samples: list[float], velocities: list[float], height: float, depth: float, density: float) -> float:
    half_height = height / 2.0
    points = [(0.0, 0.0)]
    points.extend(zip(y_samples, velocities))
    points.append((half_height, velocities[-1]))
    integral = 0.0
    for (y0, u0), (y1, u1) in zip(points, points[1:]):
        integral += (y1 - y0) * (u0 + u1) / 2.0
    return 2.0 * density * depth * integral


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def latest_time_directory(case_dir: Path) -> Path:
    candidates: list[tuple[float, Path]] = []
    for child in case_dir.iterdir():
        if child.is_dir():
            try:
                candidates.append((float(child.name), child))
            except ValueError:
                continue
    if not candidates:
        raise WorkerError("OpenFOAM did not write a final time directory.")
    return max(candidates, key=lambda item: item[0])[1]


def make_artifact(artifact_dir: Path, kind: str, filename: str, media_type: str) -> dict[str, str]:
    path = artifact_dir / filename
    return {
        "kind": kind,
        "path": f"artifacts/{filename}",
        "mediaType": media_type,
        "sha256": sha256_file(path),
    }


def execute_case(request: dict[str, Any]) -> dict[str, Any]:
    job_id = uuid.uuid4().hex
    artifact_dir = ARTIFACT_ROOT / job_id
    artifact_dir.mkdir(parents=True, exist_ok=False)
    timeout = int(request["solver"]["timeoutSeconds"])
    started = time.monotonic()

    with tempfile.TemporaryDirectory(prefix="openfoam14-", dir="/tmp") as temporary:
        case_dir = Path(temporary) / "case"
        case_dir.mkdir()
        y_samples = write_case(case_dir, request)

        logs: list[str] = []
        try:
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
                    cell_matches = re.findall(r"^\\s*cells:\\s*(\\d+)", output, flags=re.MULTILINE)
                    if not cell_matches or int(cell_matches[-1]) != int(request["mesh"]["cellsVertical"]):
                        raise WorkerError("OpenFOAM checkMesh cell count does not match the requested mesh.")

            solver_log = logs[-1]
            residuals = final_residuals(solver_log)
            converged = (
                residuals["pressure"] <= float(request["solver"]["residualTolerance"])
                and residuals["velocity"] <= float(request["solver"]["residualTolerance"])
            )
            if "End" not in solver_log:
                raise WorkerError("OpenFOAM solver did not reach a normal End marker.")

            probe_candidates = list(case_dir.glob("postProcessing/**/U"))
            if not probe_candidates:
                raise WorkerError("OpenFOAM did not create the requested velocity-profile probes.")
            velocities = last_probe_values(probe_candidates[0], len(y_samples))
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

            final_dir = latest_time_directory(case_dir)
            mesh_archive = artifact_dir / "mesh.tar.gz"
            with tarfile.open(mesh_archive, "w:gz") as archive:
                archive.add(case_dir / "constant" / "polyMesh", arcname="polyMesh")

            velocity_archive = artifact_dir / "velocity-field.tar.gz"
            with tarfile.open(velocity_archive, "w:gz") as archive:
                archive.add(final_dir / "U", arcname="U")
                archive.add(probe_candidates[0], arcname="velocity-profile")

            shutil.copy2(final_dir / "p", artifact_dir / "pressure-field")
            combined_log = artifact_dir / "solver.log"
            combined_log.write_text("\n".join(logs), encoding="utf-8")

            artifacts = [
                make_artifact(artifact_dir, "MESH", "mesh.tar.gz", "application/gzip"),
                make_artifact(artifact_dir, "VELOCITY_FIELD", "velocity-field.tar.gz", "application/gzip"),
                make_artifact(artifact_dir, "PRESSURE_FIELD", "pressure-field", "text/plain"),
                make_artifact(artifact_dir, "SOLVER_LOG", "solver.log", "text/plain"),
            ]
            return {
                "jobId": job_id,
                "status": "COMPLETED",
                "solver": "OpenFOAM",
                "solverVersion": "14",
                "converged": converged,
                "meshCells": int(request["mesh"]["cellsVertical"]),
                "massFluxKgS": mass_flux,
                "residuals": residuals,
                "velocityProfile": profile,
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
    if not WORKER_TOKEN:
        raise RuntimeError("OPENFOAM_WORKER_TOKEN must be configured before the worker starts.")
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    server = HTTPServer((HOST, PORT), Handler)
    print(f"OpenFOAM 14 worker listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
