#!/usr/bin/env python3
"""Small authenticated API for the bounded CAD worker.

No endpoint executes arbitrary client-supplied Python. CAD execution accepts only the
application's deterministic cylinder source template and a bounded typed specification.
OCCT validation runs as a separate process over a read-only BREP file.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import PackageNotFoundError, version
from typing import Any

HOST = os.getenv("WORKER_HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", os.getenv("WORKER_PORT", "10000")))
API_TOKEN = os.getenv("WORKER_API_TOKEN", "")
MAX_REQUEST_BYTES = 12 * 1024 * 1024
MAX_ARTIFACT_BYTES = 4 * 1024 * 1024
MAX_TOTAL_ARTIFACT_BYTES = 8 * 1024 * 1024
MAX_VALIDATION_TIMEOUT_SECONDS = 50
TOKEN_PATTERN = re.compile(r"^[a-f0-9]{64}$")
LOCK = threading.Lock()
ACTIVE_JOBS = 0
MAX_CONCURRENCY = max(1, min(2, int(os.getenv("WORKER_MAX_CONCURRENCY", "1"))))
EXECUTOR = threading.BoundedSemaphore(MAX_CONCURRENCY)
VALIDATOR_SCRIPT = pathlib.Path("/opt/cad-worker/validate_brep.py")
GENERATOR_SCRIPT = pathlib.Path("/opt/cad-worker/execute_cad.py")
ARTIFACT_NAMES = {
    "source": "source.py",
    "solid": "part.brep",
    "step": "part.step",
    "stl": "part.stl",
    "threeMf": "part.3mf"
}


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    raw = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json; charset=utf-8")
    handler.send_header("content-length", str(len(raw)))
    handler.send_header("cache-control", "no-store")
    handler.send_header("x-content-type-options", "nosniff")
    handler.end_headers()
    handler.wfile.write(raw)


def authorized(handler: BaseHTTPRequestHandler) -> bool:
    expected = os.getenv("WORKER_API_TOKEN", "")
    supplied = handler.headers.get("authorization", "")
    if not expected or not TOKEN_PATTERN.fullmatch(expected):
        return False
    return hmac.compare_digest(supplied, "Bearer " + expected)


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    raw_length = handler.headers.get("content-length", "")
    try:
        length = int(raw_length)
    except (TypeError, ValueError):
        raise ValueError("Content-Length is required.")
    if length < 2 or length > MAX_REQUEST_BYTES:
        raise ValueError("Request body exceeds the worker's 12 MiB limit.")
    raw = handler.rfile.read(length)
    if len(raw) != length:
        raise ValueError("Request body was truncated.")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("Request body must be valid JSON.")
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    return payload


def runtime_readiness() -> dict[str, Any]:
    checks = []
    token_valid = bool(TOKEN_PATTERN.fullmatch(os.getenv("WORKER_API_TOKEN", "")))
    checks.append({"name": "server_authentication", "status": "PASS" if token_valid else "FAIL",
                   "detail": "A 256-bit bearer token is configured." if token_valid else "WORKER_API_TOKEN must be a 64-character lowercase hex token."})
    scripts_ready = GENERATOR_SCRIPT.is_file() and VALIDATOR_SCRIPT.is_file()
    checks.append({"name": "trusted_worker_scripts", "status": "PASS" if scripts_ready else "FAIL",
                   "detail": "The fixed generation and OCCT validation scripts are installed." if scripts_ready else "A required trusted worker script is missing."})
    try:
        build123d_version = version("build123d")
        from build123d import Cylinder, import_brep
        library_ready = bool(build123d_version) and callable(Cylinder) and callable(import_brep)
        detail = "build123d and its OpenCascade bindings import successfully (" + build123d_version + ")."
    except Exception:
        library_ready = False
        detail = "build123d/OpenCascade dependencies did not import successfully."
        build123d_version = "unknown"
    checks.append({"name": "build123d_occt_runtime", "status": "PASS" if library_ready else "FAIL", "detail": detail})
    ready = all(item["status"] == "PASS" for item in checks)
    return {"ready": ready, "status": "READY" if ready else "NOT_READY", "build123dVersion": build123d_version,
            "capabilities": ["CAD.CREATE_CYLINDER", "CAD.VALIDATE_BREP"], "checks": checks}


class Handler(BaseHTTPRequestHandler):
    server_version = "EngineeringCADWorker/0.1"

    def do_GET(self) -> None:
        if self.path == "/healthz":
            json_response(self, 200, {"status": "ok", "service": "ai-mechanical-cad-worker", "version": "0.1.0"})
            return
        if self.path == "/v1/readiness":
            if not authorized(self):
                json_response(self, 401, {"ready": False, "status": "UNAUTHORIZED", "error": "Unauthorized"})
                return
            data = runtime_readiness()
            json_response(self, 200 if data["ready"] else 503, data)
            return
        json_response(self, 404, {"error": "Not found"})

    def do_POST(self) -> None:
        if not authorized(self):
            json_response(self, 401, {"error": "Unauthorized"})
            return
        if self.path not in ("/v1/cad/execute", "/v1/cad/validate"):
            json_response(self, 404, {"error": "Not found"})
            return
        try:
            payload = read_json(self)
            if not EXECUTOR.acquire(blocking=False):
                json_response(self, 429, {"error": "CAD worker is at its concurrency limit; retry later."})
                return
            try:
                if self.path == "/v1/cad/execute":
                    response = self.execute_cad(payload)
                else:
                    response = self.validate_cad(payload)
                json_response(self, 200, response)
            finally:
                EXECUTOR.release()
        except ValueError as exc:
            json_response(self, 400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            json_response(self, 504, {"error": "CAD operation exceeded its execution timeout."})
        except Exception:
            json_response(self, 500, {"error": "CAD worker could not complete the bounded operation."})

    def execute_cad(self, payload: dict[str, Any]) -> dict[str, Any]:
        execution_id = payload.get("id")
        backend = payload.get("backend")
        source = payload.get("source")
        filename = payload.get("filename")
        timeout_ms = payload.get("timeoutMs", 30000)
        parameters = payload.get("parameters")
        if not isinstance(execution_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", execution_id):
            raise ValueError("A bounded execution id is required.")
        if backend != "build123d":
            raise ValueError("Only the build123d backend is available.")
        if not isinstance(source, str) or not source or len(source.encode("utf-8")) > 250_000:
            raise ValueError("CAD source is missing or exceeds the 250000-byte limit.")
        if not isinstance(filename, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}\.py", filename):
            raise ValueError("A simple Python artifact filename is required.")
        if not isinstance(timeout_ms, int) or isinstance(timeout_ms, bool) or not 100 <= timeout_ms <= 60000:
            raise ValueError("timeoutMs must be between 100 and 60000.")
        if not isinstance(parameters, dict):
            raise ValueError("A deterministic CAD specification is required.")
        with tempfile.TemporaryDirectory(prefix="cad-run-") as temp_root:
            output_dir = pathlib.Path(temp_root) / "output"
            request = {"source": source, "filename": filename, "parameters": parameters}
            env = dict(os.environ)
            env["CAD_ARTIFACT_DIR"] = str(output_dir)
            run = subprocess.run(
                [sys.executable, str(GENERATOR_SCRIPT)],
                input=json.dumps(request, separators=(",", ":")),
                text=True, capture_output=True, timeout=min(60, max(20, timeout_ms / 1000)),
                env=env, cwd=temp_root, check=False
            )
            if run.returncode != 0 or not run.stdout.strip():
                raise RuntimeError("Trusted CAD generator returned no structured result.")
            try:
                result = json.loads(run.stdout)
            except json.JSONDecodeError:
                raise RuntimeError("Trusted CAD generator returned malformed JSON.")
            if not isinstance(result, dict) or result.get("success") is not True:
                detail = result.get("error") if isinstance(result, dict) else None
                raise ValueError(detail if isinstance(detail, str) else "The bounded CAD specification was rejected.")
            artifacts = result.get("artifacts")
            if not isinstance(artifacts, dict) or set(artifacts) != set(ARTIFACT_NAMES):
                raise RuntimeError("Trusted CAD generator did not return the complete artifact contract.")
            sizes = 0
            for key, expected_name in ARTIFACT_NAMES.items():
                item = artifacts.get(key)
                if not isinstance(item, dict) or item.get("filename") != expected_name:
                    raise RuntimeError("Trusted CAD artifact manifest did not match its allowlist.")
                data = item.get("contentBase64")
                digest = item.get("sha256")
                size = item.get("sizeBytes")
                if not isinstance(data, str) or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
                    raise RuntimeError("Trusted CAD artifact content/digest is malformed.")
                decoded = base64.b64decode(data, validate=True)
                if len(decoded) != size or len(decoded) > MAX_ARTIFACT_BYTES or hashlib.sha256(decoded).hexdigest() != digest:
                    raise RuntimeError("Trusted CAD artifact failed size/digest validation.")
                sizes += len(decoded)
            if sizes > MAX_TOTAL_ARTIFACT_BYTES:
                raise RuntimeError("Trusted CAD artifacts exceed the response size limit.")
            return {"success": True, "backend": "build123d", "executionId": execution_id,
                    "artifacts": artifacts, "warnings": result.get("warnings", [])}

    def validate_cad(self, payload: dict[str, Any]) -> dict[str, Any]:
        artifact_b64 = payload.get("artifactBase64")
        expected_hash = payload.get("artifactSha256")
        expected = payload.get("parameters")
        tolerance = payload.get("toleranceMm", 0.01)
        if not isinstance(artifact_b64, str) or len(artifact_b64) > 6 * 1024 * 1024:
            raise ValueError("A bounded BREP base64 artifact is required.")
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
            raise ValueError("A SHA-256 BREP digest is required.")
        if not isinstance(expected, dict) or expected.get("kind") != "CYLINDER":
            raise ValueError("Only the cylinder validation contract is supported.")
        diameter = expected.get("diameterMm")
        length = expected.get("lengthMm")
        if not isinstance(diameter, (int, float)) or isinstance(diameter, bool) or not 0 < diameter <= 10000:
            raise ValueError("Expected cylinder diameter is invalid.")
        if not isinstance(length, (int, float)) or isinstance(length, bool) or not 0 < length <= 10000:
            raise ValueError("Expected cylinder length is invalid.")
        if not isinstance(tolerance, (int, float)) or isinstance(tolerance, bool) or not 0 < tolerance <= 1:
            raise ValueError("Geometry tolerance must be greater than 0 and at most 1 mm.")
        try:
            artifact = base64.b64decode(artifact_b64, validate=True)
        except Exception:
            raise ValueError("BREP artifact base64 is malformed.")
        if not artifact or len(artifact) > MAX_ARTIFACT_BYTES or hashlib.sha256(artifact).hexdigest() != expected_hash:
            raise ValueError("BREP artifact failed size or SHA-256 validation.")

        with tempfile.TemporaryDirectory(prefix="occt-check-") as temp_root:
            artifact_root = pathlib.Path(temp_root) / "artifacts"
            artifact_root.mkdir(mode=0o700)
            brep = artifact_root / "part.brep"
            brep.write_bytes(artifact)
            stdin = json.dumps({"artifactPath": "/artifacts/part.brep", "expected": {
                "kind": "CYLINDER", "diameterMm": float(diameter), "lengthMm": float(length),
                "toleranceMm": float(tolerance)
            }}, separators=(",", ":"))
            env = dict(os.environ)
            env["CAD_ARTIFACT_DIR"] = str(artifact_root)
            result = subprocess.run(
                [sys.executable, str(VALIDATOR_SCRIPT)], input=stdin, text=True,
                capture_output=True, timeout=MAX_VALIDATION_TIMEOUT_SECONDS,
                env=env, cwd=temp_root, check=False
            )
            if result.returncode != 0 or not result.stdout.strip():
                raise RuntimeError("OpenCascade validator returned no structured result.")
            try:
                verdict = json.loads(result.stdout)
            except json.JSONDecodeError:
                raise RuntimeError("OpenCascade validator returned malformed JSON.")
            if not isinstance(verdict, dict) or not isinstance(verdict.get("valid"), bool):
                raise RuntimeError("OpenCascade validator response did not match the validation contract.")
            verdict["artifactSha256"] = hashlib.sha256(artifact).hexdigest()
            return verdict

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    if not GENERATOR_SCRIPT.is_file() or not VALIDATOR_SCRIPT.is_file():
        raise RuntimeError("Trusted CAD worker scripts are missing.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print("ai-mechanical-cad-worker listening on " + HOST + ":" + str(PORT), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
