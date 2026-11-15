#!/usr/bin/env python3
"""Authenticated asynchronous HTTP job boundary for the isolated CalculiX/Gmsh worker."""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

HOST = os.getenv("WORKER_HOST", "0.0.0.0")
PORT = int(os.getenv("WORKER_PORT", "8090"))
API_TOKEN = os.getenv("WORKER_API_TOKEN", "")
ARTIFACT_ROOT = Path(os.getenv("FEA_ARTIFACT_DIR", "/artifacts")).resolve()
MAX_BODY_BYTES = 1_000_000
MAX_TIMEOUT_MS = 150_000
MAX_SOLVER_TIMEOUT_MS = 120_000
WORKER_SCRIPT = Path(__file__).with_name("worker.py")
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


def persist_job(job: dict[str, Any]) -> None:
    directory = ARTIFACT_ROOT / job["jobId"]
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
    if request.get("backend") != "fea-worker":
        raise ValueError("Only the fea-worker backend is supported.")
    if request.get("capability") != "ANALYSIS.STATIC_STRUCTURAL":
        raise ValueError("Only ANALYSIS.STATIC_STRUCTURAL is supported.")


def require_fea_inputs(request: dict[str, Any]) -> dict[str, Any]:
    inputs = request.get("inputs")
    if not isinstance(inputs, dict):
        raise ValueError("FEA inputs must be a JSON object.")
    if inputs.get("analysis") != "STATIC_STRUCTURAL":
        raise ValueError("The current CalculiX runtime requires STATIC_STRUCTURAL analysis.")
    if inputs.get("benchmark") != "cantilever_box":
        raise ValueError("The current CalculiX runtime supports the cantilever_box reference benchmark only.")
    return inputs


def require_worker_timeout(request: dict[str, Any]) -> int:
    timeout_ms = request.get("timeoutMs")
    if isinstance(timeout_ms, bool) or not isinstance(timeout_ms, int):
        raise ValueError("timeoutMs must be an integer between 1000 and 120000.")
    if not 1000 <= timeout_ms <= MAX_TIMEOUT_MS:
        raise ValueError("timeoutMs must be an integer between 1000 and 120000.")
    return timeout_ms


def validate_request(request: Any) -> tuple[str, int]:
    body = require_request_object(request)
    job_id = require_job_id(body)
    validate_worker_route(body)
    require_fea_inputs(body)
    timeout_ms = require_worker_timeout(body)
    return job_id, timeout_ms



def has_only_finite_numbers(value: Any) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(has_only_finite_numbers(item) for item in value)
    if isinstance(value, dict):
        return all(has_only_finite_numbers(item) for item in value.values())
    return True


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
    raise RuntimeError("CalculiX worker returned no valid JSON result.")


def validate_json_result_numbers(result: dict[str, Any]) -> None:
    if not has_only_finite_numbers(result):
        raise RuntimeError("CalculiX worker returned non-finite numeric values.")


def result_warnings(result: dict[str, Any], success: bool) -> list[str]:
    warnings = result.get("warnings")
    if isinstance(warnings, list):
        normalized = [str(item) for item in warnings]
    else:
        normalized = []
    if not success and not normalized:
        normalized.append(str(result.get("error") or "CalculiX reference benchmark failed."))
    return normalized


def normalize_worker_result(raw_result: dict[str, Any], return_code: int, request: dict[str, Any]) -> dict[str, Any]:
    success = return_code == 0 and raw_result.get("success") is True
    return {
        "success": success,
        "outputs": {"feaResult": raw_result},
        "warnings": result_warnings(raw_result, success),
        "artifactIds": [],
        "provider": "open.calculix",
        "providerVersion": str(raw_result.get("solverVersion") or "unknown"),
        "executionId": request["id"],
        "completedAt": utc_now(),
    }


def parse_worker_result(stdout: str, return_code: int, request: dict[str, Any]) -> dict[str, Any]:
    raw_result = extract_json_result(stdout)
    validate_json_result_numbers(raw_result)
    return normalize_worker_result(raw_result, return_code, request)



def terminate_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def mark_job_running(job_id: str) -> bool:
    with LOCK:
        job = JOBS.get(job_id)
        if not job:
            return False
        if job.get("cancelRequested"):
            job.update(
                status="CANCELLED",
                error="Cancelled before solver process started.",
                errorCode="CANCELLED",
                updatedAt=utc_now(),
            )
            persist_job(job)
            return False
        job.update(status="RUNNING", startedAt=utc_now(), updatedAt=utc_now())
        persist_job(job)
        return True


def prepare_fea_worker_payload(job_id: str, request: dict[str, Any], timeout_ms: int) -> tuple[dict[str, Any], dict[str, str]]:
    directory = ARTIFACT_ROOT / job_id
    directory.mkdir(parents=True, exist_ok=True)
    payload = dict(request["inputs"])
    payload["analysis"] = "STATIC_STRUCTURAL"
    payload["benchmark"] = "cantilever_box"
    payload["timeoutMs"] = min(timeout_ms, MAX_SOLVER_TIMEOUT_MS)
    environment = os.environ.copy()
    environment["FEA_ARTIFACT_DIR"] = str(directory)
    return payload, environment


def start_fea_worker_process(directory: Path, environment: dict[str, str]) -> subprocess.Popen[str]:
    return subprocess.Popen(
        [sys.executable, str(WORKER_SCRIPT)],
        cwd=str(directory),
        env=environment,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
        shell=False,
    )


def register_worker_process(job_id: str, process: subprocess.Popen[str]) -> bool:
    with LOCK:
        job = JOBS.get(job_id)
        if job:
            job["process"] = process
            cancelled = bool(job.get("cancelRequested"))
        else:
            cancelled = True
    if cancelled:
        terminate_process(process)
        return False
    return True


def communicate_fea_worker(
    process: subprocess.Popen[str],
    payload: dict[str, Any],
    timeout_ms: int
) -> tuple[str, str]:
    try:
        return process.communicate(
            input=json.dumps(payload, separators=(",", ":"), allow_nan=False),
            timeout=max(1, (timeout_ms - 5000) / 1000),
        )
    except subprocess.TimeoutExpired:
        terminate_process(process)
        process.communicate()
        raise TimeoutError("CalculiX worker exceeded its bounded execution timeout.")


def finish_job(job_id: str, result: dict[str, Any], stderr: str) -> None:
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
            job.update(
                status="FAILED",
                result=result,
                error="CalculiX reference benchmark did not pass solver and analytical checks.",
                errorCode="FEA_VALIDATION_FAILED",
            )
        job.update(updatedAt=utc_now())
        job.pop("process", None)
        persist_job(job)


def fail_job(job_id: str, error: Exception) -> None:
    with LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        if job.get("cancelRequested"):
            job.update(status="CANCELLED", error="Execution cancellation was requested.", errorCode="CANCELLED")
        else:
            job.update(status="FAILED", error=str(error)[:2000], errorCode="FEA_WORKER_FAILED")
        job.update(updatedAt=utc_now())
        job.pop("process", None)
        persist_job(job)


def run_job(job_id: str, request: dict[str, Any], timeout_ms: int) -> None:
    if not mark_job_running(job_id):
        return
    directory = ARTIFACT_ROOT / job_id
    process: subprocess.Popen[str] | None = None
    try:
        payload, environment = prepare_fea_worker_payload(job_id, request, timeout_ms)
        process = start_fea_worker_process(directory, environment)
        if not register_worker_process(job_id, process):
            return
        stdout, stderr = communicate_fea_worker(process, payload, timeout_ms)
        result = parse_worker_result(stdout, process.returncode or 0, request)
        finish_job(job_id, result, stderr)
    except Exception as exc:
        fail_job(job_id, exc)

def restore_jobs() -> None:
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    for metadata in ARTIFACT_ROOT.glob("*/job.json"):
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
    with LOCK:
        existing = JOBS.get(job_id)
        if existing:
            if existing.get("requestHash") != request_hash:
                return 409, {"accepted": False, "jobId": job_id, "status": "REJECTED", "error": "Job ID reused with a different request."}
            if existing.get("errorCode") == "RECONCILIATION_REQUIRED":
                return 409, {"accepted": False, "jobId": job_id, "status": "REJECTED", "error": existing.get("error")}
            return 202, {"accepted": True, "jobId": job_id, "status": existing["status"]}
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


def is_safe_artifact_job_id(job_id: str) -> bool:
    pattern = r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
    return bool(re.fullmatch(pattern, job_id, re.IGNORECASE))


def is_safe_artifact_relative_path(relative_path: str) -> bool:
    if not relative_path:
        return False
    if relative_path.startswith("/") or "\\" in relative_path:
        return False
    return all(part not in {"", ".", ".."} for part in relative_path.split("/"))


def resolve_artifact(job_id: str, relative_path: str) -> Path | None:
    if not is_safe_artifact_job_id(job_id):
        return None
    if not is_safe_artifact_relative_path(relative_path):
        return None
    job_root = (ARTIFACT_ROOT / job_id).resolve()
    try:
        candidate = (job_root / relative_path).resolve()
        candidate.relative_to(job_root)
    except (OSError, ValueError):
        return None
    return candidate if candidate.is_file() else None



class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "CalculixWorker/1.0"
    sys_version = ""

    def authorized(self) -> bool:
        if not API_TOKEN:
            return HOST.strip().lower() in {"127.0.0.1", "::1", "localhost"}
        supplied = self.headers.get("authorization", "")
        return hmac.compare_digest(supplied, "Bearer " + API_TOKEN)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            json_response(self, 200, {"status": "ok", "provider": "open.calculix"})
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
            file_path = resolve_artifact(job_id, unquote(relative))
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
    print(json.dumps({"event": "calculix_worker_started", "host": HOST, "port": PORT, "restoredJobs": len(JOBS)}), flush=True)
    try:
        server.serve_forever()
    finally:
        POOL.shutdown(wait=False, cancel_futures=True)
        server.server_close()


if __name__ == "__main__":
    main()
