#!/usr/bin/env python3
"""Reference HTTP service for the isolated allowlisted engineering computation worker."""
from __future__ import annotations
import hashlib
import json
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from worker import OPS

MAX_BODY_BYTES = 1_000_000
HOST = os.getenv("WORKER_HOST", "127.0.0.1")
PORT = int(os.getenv("WORKER_PORT", "8090"))
API_TOKEN = os.getenv("WORKER_API_TOKEN")
JOBS: dict[str, dict[str, Any]] = {}
LOCK = threading.Lock()
POOL = ThreadPoolExecutor(max_workers=int(os.getenv("WORKER_MAX_CONCURRENCY", "2")))

def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)

def _request_hash(request: dict[str, Any]) -> str:
    canonical = json.dumps(request, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: job[key] for key in ("jobId", "status", "result", "error", "cancelRequested") if key in job}

def _run_job(job_id: str, request: dict[str, Any]) -> None:
    with LOCK:
        current = JOBS.get(job_id)
        if not current or current["status"] == "CANCELLED":
            return
        current["status"] = "RUNNING"
    try:
        capability = request.get("capability")
        if capability not in OPS:
            raise ValueError(f"Unsupported capability: {capability}")
        outputs = OPS[capability](request.get("inputs", {}))
        result = {"success": True, "outputs": outputs, "warnings": [], "artifactIds": [], "provider": "python-engineering-worker"}
        with LOCK:
            current = JOBS.get(job_id)
            if not current:
                return
            if current.get("cancelRequested"):
                current.update(status="CANCELLED", error="Cancellation requested.")
            else:
                current.update(status="SUCCEEDED", result=result)
    except Exception as exc:
        with LOCK:
            current = JOBS.get(job_id)
            if not current:
                return
            if current.get("cancelRequested"):
                current.update(status="CANCELLED", error="Cancellation requested.")
            else:
                current.update(status="FAILED", error=str(exc), result={"success": False, "outputs": {}, "warnings": [str(exc)], "artifactIds": [], "provider": "python-engineering-worker"})

class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "EngineeringWorker/0.2"
    def _authorized(self) -> bool:
        return not API_TOKEN or self.headers.get("authorization") == f"Bearer {API_TOKEN}"

    def do_POST(self) -> None:
        if not self._authorized():
            _json_response(self, 401, {"accepted": False, "status": "REJECTED", "error": "Unauthorized"})
            return
        if self.path != "/v1/jobs":
            _json_response(self, 404, {"accepted": False, "status": "REJECTED", "error": "Not found"})
            return
        length = int(self.headers.get("content-length", "0"))
        if length <= 0 or length > MAX_BODY_BYTES:
            _json_response(self, 413, {"accepted": False, "status": "REJECTED", "error": "Invalid request size"})
            return
        try:
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object")
            capability = request.get("capability")
            if capability not in OPS:
                raise ValueError(f"Unsupported capability: {capability}")
            job_id = str(request.get("id") or uuid.uuid4())
            request_hash = _request_hash(request)
            with LOCK:
                existing = JOBS.get(job_id)
                if existing:
                    if existing.get("requestHash") != request_hash:
                        _json_response(self, 409, {"accepted": False, "jobId": job_id, "status": "REJECTED", "error": "Job ID reused with different request"})
                        return
                    _json_response(self, 202, {"accepted": True, "jobId": job_id, "status": existing["status"]})
                    return
                JOBS[job_id] = {"jobId": job_id, "status": "QUEUED", "requestHash": request_hash, "cancelRequested": False}
            POOL.submit(_run_job, job_id, request)
            _json_response(self, 202, {"accepted": True, "jobId": job_id, "status": "QUEUED"})
        except Exception as exc:
            _json_response(self, 400, {"accepted": False, "status": "REJECTED", "error": str(exc)})

    def do_GET(self) -> None:
        if not self._authorized():
            _json_response(self, 401, {"jobId": "", "status": "FAILED", "error": "Unauthorized"})
            return
        prefix = "/v1/jobs/"
        if not self.path.startswith(prefix):
            _json_response(self, 404, {"jobId": "", "status": "FAILED", "error": "Not found"})
            return
        job_id = self.path[len(prefix):]
        with LOCK:
            job = JOBS.get(job_id)
            view = _public_job(job) if job else None
        if not view:
            _json_response(self, 404, {"jobId": job_id, "status": "FAILED", "error": "Job not found"})
            return
        _json_response(self, 200, view)

    def do_DELETE(self) -> None:
        if not self._authorized():
            _json_response(self, 401, {"jobId": "", "status": "FAILED", "error": "Unauthorized"})
            return
        prefix = "/v1/jobs/"
        if not self.path.startswith(prefix):
            _json_response(self, 404, {"jobId": "", "status": "FAILED", "error": "Not found"})
            return
        job_id = self.path[len(prefix):]
        with LOCK:
            job = JOBS.get(job_id)
            if job:
                if job["status"] == "QUEUED":
                    job.update(status="CANCELLED", cancelRequested=True, error="Cancelled before computation began.")
                elif job["status"] == "RUNNING":
                    job["cancelRequested"] = True
                view = _public_job(job) if job else None
        if not view:
            _json_response(self, 404, {"jobId": job_id, "status": "FAILED", "error": "Job not found"})
            return
        _json_response(self, 200, view)

    def log_message(self, format: str, *args: Any) -> None:
        return

def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), WorkerHandler)
    print(f"engineering worker listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    finally:
        POOL.shutdown(wait=False, cancel_futures=True)
        server.server_close()

if __name__ == "__main__":
    main()
