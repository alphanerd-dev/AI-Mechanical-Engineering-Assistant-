#!/usr/bin/env python3
"""Reference HTTP service for the isolated engineering computation worker.

This service is intentionally small and transport-focused. Production deployments
should run it in a dedicated container/VM with network, CPU, memory and filesystem
limits plus durable job storage.
"""
from __future__ import annotations

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


def _run_job(job_id: str, request: dict[str, Any]) -> None:
    with LOCK:
        JOBS[job_id]["status"] = "RUNNING"
    try:
        capability = request.get("capability")
        if capability not in OPS:
            raise ValueError(f"Unsupported capability: {capability}")
        outputs = OPS[capability](request.get("inputs", {}))
        result = {
            "success": True,
            "outputs": outputs,
            "warnings": [],
            "artifactIds": [],
            "provider": "python-engineering-worker",
        }
        with LOCK:
            JOBS[job_id].update(status="SUCCEEDED", result=result)
    except Exception as exc:
        with LOCK:
            JOBS[job_id].update(
                status="FAILED",
                error=str(exc),
                result={
                    "success": False,
                    "outputs": {},
                    "warnings": [str(exc)],
                    "artifactIds": [],
                    "provider": "python-engineering-worker",
                },
            )


class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "EngineeringWorker/0.1"

    def _authorized(self) -> bool:
        if not API_TOKEN:
            return True
        return self.headers.get("authorization") == f"Bearer {API_TOKEN}"

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
            with LOCK:
                JOBS[job_id] = {"jobId": job_id, "status": "QUEUED"}
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
        if not job:
            _json_response(self, 404, {"jobId": job_id, "status": "FAILED", "error": "Job not found"})
            return
        _json_response(self, 200, job)

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
