#!/usr/bin/env python3
"""Authenticated asynchronous job API for the isolated OpenFOAM 14 worker."""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import signal
import subprocess
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from manifest import validate_request as validate_openfoam_request

HOST = os.getenv("WORKER_HOST", "0.0.0.0")
PORT = int(os.getenv("WORKER_PORT", "8091"))
API_TOKEN = os.getenv("WORKER_API_TOKEN", "")
ARTIFACT_ROOT = Path(os.getenv("OPENFOAM_ARTIFACT_DIR", "/artifacts")).resolve()
JOB_STATE_ROOT = ARTIFACT_ROOT / ".jobs"
WORKER_SCRIPT = Path(__file__).with_name("run_case.py")
MAX_BODY_BYTES = 1_000_000
MAX_TIMEOUT_MS = 720_000
JOBS: dict[str, dict[str, Any]] = {}
LOCK = threading.RLock()
POOL = ThreadPoolExecutor(max_workers=max(1, min(8, int(os.getenv("WORKER_MAX_CONCURRENCY", "2")))))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    raw = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(raw)))
    handler.send_header("cache-control", "no-store")
    handler.end_headers()
    handler.wfile.write(raw)


def canonical_hash(value: dict[str, Any]) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def has_only_finite_numbers(value: Any) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(has_only_finite_numbers(item) for item in value)
    if isinstance(value, dict):
        return all(has_only_finite_numbers(item) for item in value.values())
    return True


def persist_job(job: dict[str, Any]) -> None:
    directory = JOB_STATE_ROOT / job["jobId"]
    directory.mkdir(parents=True, exist_ok=True)
    public = {key: value for key, value in job.items() if key != "process"}
    temporary = directory / "job.json.tmp"
    temporary.write_text(json.dumps(public, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    temporary.replace(directory / "job.json")


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: job[key] for key in ("jobId", "status", "result", "error", "errorCode", "cancelRequested") if key in job}


def require_request_object(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Execution request must be a JSON object.")
    return value


def require_job_id(request: dict[str, Any]) -> str:
    job_id = request.get("id")
    if not isinstance(job_id, str):
        raise ValueError("Execution request id is required.")
    try:
        uuid.UUID(job_id)
    except ValueError as exc:
        raise ValueError("Execution request id must be a UUID.") from exc
    return job_id


def validate_worker_route(request: dict[str, Any]) -> None:
    if request.get("backend") != "cfd-worker":
        raise ValueError("Only the cfd-worker backend is supported.")
    if request.get("capability") != "ANALYSIS.CFD_LAMINAR_CHANNEL":
        raise ValueError("Only ANALYSIS.CFD_LAMINAR_CHANNEL is supported.")


def require_openfoam_inputs(request: dict[str, Any]) -> dict[str, Any]:
    inputs = request.get("inputs")
    if not isinstance(inputs, dict):
        raise ValueError("OpenFOAM inputs must be a JSON object.")
    errors = validate_openfoam_request(inputs)
    if errors:
        raise ValueError("; ".join(errors))
    return inputs


def require_execution_timeout(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("timeoutMs must be an integer between 10000 and 720000.")
    if not 10000 <= value <= MAX_TIMEOUT_MS:
        raise ValueError("timeoutMs must be an integer between 10000 and 720000.")
    return value


def validate_solver_timeout_budget(inputs: dict[str, Any], timeout_ms: int) -> None:
    solver = inputs.get("solver")
    solver_timeout = solver["timeoutSeconds"] if isinstance(solver, dict) else 0
    expected_minimum = (solver_timeout + 120) * 1000
    if timeout_ms < expected_minimum:
        raise ValueError("Execution timeout must reserve the solver timeout plus 120 seconds for meshing and artifact validation.")


def validate_request(request: Any) -> tuple[str, int]:
    body = require_request_object(request)
    job_id = require_job_id(body)
    validate_worker_route(body)
    inputs = require_openfoam_inputs(body)
    timeout_ms = require_execution_timeout(body.get("timeoutMs"))
    validate_solver_timeout_budget(inputs, timeout_ms)
    return job_id, timeout_ms



def extract_json_result(stdout: str) -> dict[str, Any]:
    for line in reversed(stdout.splitlines()):
        candidate = line.strip()
        if not candidate:
            continue
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise RuntimeError("OpenFOAM worker returned no valid JSON result.")


def validate_worker_result_numbers(result: dict[str, Any]) -> None:
    if not has_only_finite_numbers(result):
        raise RuntimeError("OpenFOAM worker returned non-finite numeric values.")


def is_successful_worker_result(result: dict[str, Any], return_code: int) -> bool:
    return return_code == 0 and result.get("status") == "COMPLETED"


def worker_result_warnings(result: dict[str, Any], success: bool) -> list[str]:
    warnings = result.get("warnings")
    normalized = [str(item) for item in warnings] if isinstance(warnings, list) else []
    if not success and not normalized:
        normalized.append(str(result.get("error") or "OpenFOAM case execution failed."))
    return normalized


def normalize_worker_result(
    raw_result: dict[str, Any],
    return_code: int,
    request: dict[str, Any]
) -> dict[str, Any]:
    success = is_successful_worker_result(raw_result, return_code)
    return {
        "success": success,
        "outputs": {"cfdResult": raw_result},
        "warnings": worker_result_warnings(raw_result, success),
        "artifactIds": [],
        "provider": "openfoam14",
        "providerVersion": str(raw_result.get("solverVersion") or "14"),
        "executionId": request["id"],
        "completedAt": utc_now(),
    }


def parse_worker_result(stdout: str, return_code: int, request: dict[str, Any]) -> dict[str, Any]:
    raw_result = extract_json_result(stdout)
    validate_worker_result_numbers(raw_result)
    return normalize_worker_result(raw_result, return_code, request)



def terminate_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def run_job(job_id: str, request: dict[str, Any], timeout_ms: int) -> None:
    job_hex = uuid.UUID(job_id).hex
    environment = os.environ.copy()
    environment["OPENFOAM_ARTIFACT_DIR"] = str(ARTIFACT_ROOT)
    environment["OPENFOAM_JOB_ID"] = job_hex
    with LOCK:
        job = JOBS.get(job_id)
        if not job or job.get("cancelRequested"):
            if job:
                job.update(status="CANCELLED", error="Cancelled before solver process started.", updatedAt=utc_now())
                persist_job(job)
            return
        job.update(status="RUNNING", startedAt=utc_now(), updatedAt=utc_now())
        persist_job(job)

    process: subprocess.Popen[str] | None = None
    try:
        process = subprocess.Popen(
            [sys.executable, str(WORKER_SCRIPT)],
            cwd=str(WORKER_SCRIPT.parent),
            env=environment,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
            shell=False,
        )
        with LOCK:
            job = JOBS.get(job_id)
            if not job:
                terminate_process(process)
                return
            job["process"] = process
            if job.get("cancelRequested"):
                terminate_process(process)
        try:
            stdout, stderr = process.communicate(
                input=json.dumps(request["inputs"], separators=(",", ":"), allow_nan=False),
                timeout=(timeout_ms + 5000) / 1000,
            )
        except subprocess.TimeoutExpired:
            terminate_process(process)
            process.communicate()
            raise TimeoutError("OpenFOAM worker exceeded its bounded execution timeout.")
        result = parse_worker_result(stdout, process.returncode or 0, request)
        if stderr:
            result["warnings"] = list(result.get("warnings", [])) + ["Worker stderr: " + stderr[-4000:]]
        with LOCK:
            job = JOBS.get(job_id)
            if not job:
                return
            if job.get("cancelRequested"):
                job.update(status="CANCELLED", error="Execution cancellation was requested.", errorCode="CANCELLED")
            elif result["success"]:
                job.update(status="SUCCEEDED", result=result, error=None, errorCode=None)
            else:
                job.update(status="FAILED", result=result, error="OpenFOAM case did not complete successfully.", errorCode="CFD_WORKER_FAILED")
            job.update(updatedAt=utc_now())
            job.pop("process", None)
            persist_job(job)
    except Exception as exc:
        with LOCK:
            job = JOBS.get(job_id)
            if not job:
                return
            if job.get("cancelRequested"):
                job.update(status="CANCELLED", error="Execution cancellation was requested.", errorCode="CANCELLED")
            else:
                job.update(status="FAILED", error=str(exc)[:2000], errorCode="CFD_WORKER_FAILED")
            job.update(updatedAt=utc_now())
            job.pop("process", None)
            persist_job(job)


def restore_jobs() -> None:
    JOB_STATE_ROOT.mkdir(parents=True, exist_ok=True)
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    for metadata in JOB_STATE_ROOT.glob("*/job.json"):
        try:
            job = json.loads(metadata.read_text(encoding="utf-8"))
            if not isinstance(job, dict) or not isinstance(job.get("jobId"), str):
                continue
            if job.get("status") in {"QUEUED", "RUNNING"}:
                job.update(
                    status="FAILED",
                    error="Worker restarted while this job was active; automatic replay is disabled.",
                    errorCode="RECONCILIATION_REQUIRED",
                    updatedAt=utc_now(),
                )
                metadata.write_text(json.dumps(job, separators=(",", ":")), encoding="utf-8")
            JOBS[job["jobId"]] = job
        except (OSError, json.JSONDecodeError):
            continue


def submit_job(request: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    job_id, timeout_ms = validate_request(request)
    request_hash = canonical_hash(request)
    artifact_dir = ARTIFACT_ROOT / uuid.UUID(job_id).hex
    with LOCK:
        existing = JOBS.get(job_id)
        if existing:
            if existing.get("requestHash") != request_hash:
                return 409, {"accepted": False, "jobId": job_id, "status": "REJECTED", "error": "Job ID reused with a different request."}
            if existing.get("errorCode") == "RECONCILIATION_REQUIRED":
                return 409, {"accepted": False, "jobId": job_id, "status": "REJECTED", "error": existing.get("error")}
            return 202, {"accepted": True, "jobId": job_id, "status": existing["status"]}
        if artifact_dir.exists():
            return 409, {"accepted": False, "jobId": job_id, "status": "REJECTED", "error": "Artifact directory exists without a matching job record; manual reconciliation is required."}
        job = {
            "jobId": job_id,
            "status": "QUEUED",
            "requestHash": request_hash,
            "cancelRequested": False,
            "createdAt": utc_now(),
            "updatedAt": utc_now(),
        }
        JOBS[job_id] = job
        persist_job(job)
    POOL.submit(run_job, job_id, request, timeout_ms)
    return 202, {"accepted": True, "jobId": job_id, "status": "QUEUED"}


def cancel_job(job_id: str) -> dict[str, Any] | None:
    with LOCK:
        job = JOBS.get(job_id)
        if not job:
            return None
        if job["status"] == "QUEUED":
            job.update(status="CANCELLED", cancelRequested=True, error="Cancelled before solver process started.", errorCode="CANCELLED", updatedAt=utc_now())
            persist_job(job)
            return public_job(job)
        if job["status"] == "RUNNING":
            job.update(cancelRequested=True, updatedAt=utc_now())
            process = job.get("process")
            persist_job(job)
        else:
            return public_job(job)
    terminate_process(process)
    return public_job(job)


def normalize_artifact_path(relative_path: str) -> str | None:
    if relative_path.startswith("artifacts/"):
        relative_path = relative_path[len("artifacts/"):]
    if relative_path in {"mesh.tar.gz", "velocity-field.tar.gz", "pressure-field", "solver.log"}:
        return relative_path
    return None


def confined_job_artifact(job_id: str, filename: str) -> Path | None:
    root = (ARTIFACT_ROOT / job_id).resolve()
    candidate = (root / filename).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def resolve_artifact(job_id: str, relative_path: str) -> Path | None:
    try:
        job_hex = uuid.UUID(job_id).hex
    except ValueError:
        return None
    if not relative_path or relative_path.startswith("/") or "\\" in relative_path:
        return None
    filename = normalize_artifact_path(relative_path)
    if filename is None:
        return None
    return confined_job_artifact(job_hex, filename)


class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "OpenFOAMWorker/1.0"
    sys_version = ""

    def authorized(self) -> bool:
        if not API_TOKEN:
            return HOST.strip().lower() in {"127.0.0.1", "::1", "localhost"}
        supplied = self.headers.get("authorization", "")
        return hmac.compare_digest(supplied, "Bearer " + API_TOKEN)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            json_response(self, 200, {"status": "ok", "provider": "openfoam14"})
            return
        if not self.authorized():
            json_response(self, 401, {"jobId": "", "status": "FAILED", "error": "Unauthorized"})
            return
        prefix = "/v1/jobs/"
        if not path.startswith(prefix):
            json_response(self, 404, {"jobId": "", "status": "FAILED", "error": "Not found"})
            return
        remainder = path[len(prefix):]
        if "/artifacts/" in remainder:
            job_id, relative = remainder.split("/artifacts/", 1)
            file_path = resolve_artifact(unquote(job_id), unquote(relative))
            if not file_path:
                json_response(self, 404, {"jobId": job_id, "status": "FAILED", "error": "Artifact not found"})
                return
            raw = file_path.read_bytes()
            self.send_response(200)
            self.send_header("content-type", "application/octet-stream")
            self.send_header("content-length", str(len(raw)))
            self.send_header("cache-control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
            return
        job_id = unquote(remainder)
        with LOCK:
            job = JOBS.get(job_id)
            view = public_job(job) if job else None
        if not view:
            json_response(self, 404, {"jobId": job_id, "status": "FAILED", "error": "Job not found"})
            return
        json_response(self, 200, view)

    def do_POST(self) -> None:
        if not self.authorized():
            json_response(self, 401, {"accepted": False, "status": "REJECTED", "error": "Unauthorized"})
            return
        if urlsplit(self.path).path != "/v1/jobs":
            json_response(self, 404, {"accepted": False, "status": "REJECTED", "error": "Not found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("Invalid request size.")
            request = json.loads(self.rfile.read(length))
            status, response = submit_job(request)
            json_response(self, status, response)
        except (ValueError, json.JSONDecodeError) as exc:
            json_response(self, 400, {"accepted": False, "status": "REJECTED", "error": str(exc)})

    def do_DELETE(self) -> None:
        if not self.authorized():
            json_response(self, 401, {"jobId": "", "status": "FAILED", "error": "Unauthorized"})
            return
        prefix = "/v1/jobs/"
        path = urlsplit(self.path).path
        if not path.startswith(prefix):
            json_response(self, 404, {"jobId": "", "status": "FAILED", "error": "Not found"})
            return
        job = cancel_job(unquote(path[len(prefix):]))
        if not job:
            json_response(self, 404, {"jobId": path[len(prefix):], "status": "FAILED", "error": "Job not found"})
            return
        json_response(self, 200, job)

    def log_message(self, format: str, *args: Any) -> None:
        return


def validate_server_configuration(host: str, api_token: str) -> None:
    if host.strip().lower() not in {"127.0.0.1", "::1", "localhost"} and not api_token:
        raise RuntimeError("WORKER_API_TOKEN is required when WORKER_HOST binds beyond loopback.")


def main() -> None:
    validate_server_configuration(HOST, API_TOKEN)
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    restore_jobs()
    server = ThreadingHTTPServer((HOST, PORT), WorkerHandler)
    print(json.dumps({"event": "openfoam_worker_started", "host": HOST, "port": PORT, "restoredJobs": len(JOBS)}), flush=True)
    try:
        server.serve_forever()
    finally:
        POOL.shutdown(wait=False, cancel_futures=True)
        server.server_close()


if __name__ == "__main__":
    main()
