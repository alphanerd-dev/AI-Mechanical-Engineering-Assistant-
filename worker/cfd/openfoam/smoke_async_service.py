#!/usr/bin/env python3
"""End-to-end smoke test for the asynchronous OpenFOAM 14 job API and artifact retrieval."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SERVICE = Path(__file__).with_name("service.py")
ARTIFACT_ROOT = Path(os.environ.get("OPENFOAM_ARTIFACT_DIR", "/artifacts"))
SOLVER_TIMEOUT_SECONDS = 300
EXECUTION_TIMEOUT_MS = (SOLVER_TIMEOUT_SECONDS + 130) * 1000


@dataclass(frozen=True)
class RequestOptions:
    method: str = "GET"
    timeout: float = 10


class SmokeHttpClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _request(self, path: str, payload: dict[str, Any] | None, options: RequestOptions, authenticated: bool) -> bytes:
        headers: dict[str, str] = {}
        if authenticated:
            headers["Authorization"] = "Bearer " + self.token
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path, data=data, headers=headers, method=options.method
        )
        try:
            with urllib.request.urlopen(request, timeout=options.timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {error.code} from {path}: {body}") from error

    def request_json(
        self,
        path: str,
        payload: dict[str, Any] | None = None,
        options: RequestOptions | None = None
    ) -> dict[str, Any]:
        raw = self._request(path, payload, options or RequestOptions(), True)
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise RuntimeError("OpenFOAM service returned a non-object JSON response.")
        return value

    def request_bytes(self, path: str, timeout: float = 45) -> bytes:
        return self._request(path, None, RequestOptions(timeout=timeout), True)

    def assert_unauthenticated_post_rejected(self, path: str, payload: dict[str, Any]) -> None:
        try:
            self._request(path, payload, RequestOptions(method="POST", timeout=5), False)
        except urllib.error.HTTPError as error:
            if error.code == 401:
                return
            raise AssertionError(f"Expected HTTP 401, received HTTP {error.code}.") from error
        raise AssertionError("Unauthenticated OpenFOAM job submission was accepted.")


def reserve_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def benchmark_request() -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "backend": "cfd-worker",
        "capability": "ANALYSIS.CFD_LAMINAR_CHANNEL",
        "timeoutMs": EXECUTION_TIMEOUT_MS,
        "requestedOutputs": ["VELOCITY_PROFILE", "MASS_FLOW", "RESIDUALS", "ARTIFACTS"],
        "inputs": {
            "caseId": "laminar-channel-poiseuille-v1",
            "meanVelocityMps": 0.2,
            "heightM": 0.01,
            "depthM": 0.001,
            "densityKgM3": 1000.0,
            "kinematicViscosityM2PerS": 1e-5,
            "mesh": {"cellsVertical": 40},
            "solver": {
                "maxIterations": 2000,
                "residualTolerance": 1e-7,
                "timeoutSeconds": SOLVER_TIMEOUT_SECONDS,
            },
        },
    }


def wait_for_service(client: SmokeHttpClient, process: subprocess.Popen[str]) -> None:
    deadline = time.monotonic() + 30
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"OpenFOAM service exited during startup with code {process.returncode}.")
        try:
            health = client.request_json("/health")
            if health.get("status") == "ok" and health.get("provider") == "openfoam14":
                return
        except Exception as error:
            last_error = error
        time.sleep(0.25)
    raise RuntimeError(f"OpenFOAM service did not become healthy: {last_error}")


def wait_for_job(client: SmokeHttpClient, job_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + (EXECUTION_TIMEOUT_MS / 1000) + 60
    path = "/v1/jobs/" + urllib.parse.quote(job_id)
    while time.monotonic() < deadline:
        job = client.request_json(path, options=RequestOptions(timeout=10))
        if job.get("status") in {"SUCCEEDED", "FAILED", "CANCELLED"}:
            return job
        time.sleep(1)
    raise TimeoutError("OpenFOAM durable job did not reach a terminal state within its execution budget.")


def require_terminal_success(job: dict[str, Any]) -> dict[str, Any]:
    if job.get("status") != "SUCCEEDED":
        raise RuntimeError(f"OpenFOAM service job failed: {job.get('error') or job}")
    execution = job.get("result")
    if not isinstance(execution, dict) or execution.get("success") is not True:
        raise AssertionError("OpenFOAM service did not return a successful execution result.")
    return execution


def require_typed_cfd_result(execution: dict[str, Any]) -> dict[str, Any]:
    outputs = execution.get("outputs")
    result = outputs.get("cfdResult") if isinstance(outputs, dict) else None
    if not isinstance(result, dict):
        raise AssertionError("OpenFOAM service did not return a typed CFD result.")
    return result


def validate_cfd_solver_identity(result: dict[str, Any]) -> None:
    if result.get("status") != "COMPLETED":
        raise AssertionError("OpenFOAM solver did not complete.")
    if result.get("solverVersion") != "14":
        raise AssertionError("OpenFOAM solver version identity is invalid.")


def validate_cfd_mesh_and_profile(result: dict[str, Any], request: dict[str, Any]) -> None:
    expected_cells = request["inputs"]["mesh"]["cellsVertical"]
    if result.get("meshCells") != expected_cells:
        raise AssertionError("OpenFOAM mesh cardinality does not match the request.")
    profile = result.get("velocityProfile")
    if not isinstance(profile, list) or len(profile) < 20:
        raise AssertionError("OpenFOAM velocity profile is incomplete.")


def require_successful_cfd_result(job: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    execution = require_terminal_success(job)
    result = require_typed_cfd_result(execution)
    validate_cfd_solver_identity(result)
    validate_cfd_mesh_and_profile(result, request)
    return result

def download_artifact(client: SmokeHttpClient, job_id: str, artifact: dict[str, Any]) -> Path:
    path = artifact.get("path")
    expected = artifact.get("sha256")
    if not isinstance(path, str) or not isinstance(expected, str):
        raise AssertionError("OpenFOAM artifact metadata is malformed.")
    encoded_path = urllib.parse.quote(path, safe="/")
    url = "/v1/jobs/" + urllib.parse.quote(job_id) + "/artifacts/" + encoded_path
    contents = client.request_bytes(url)
    digest = hashlib.sha256(contents).hexdigest()
    if digest != expected:
        raise AssertionError(f"SHA-256 mismatch for OpenFOAM artifact {path}.")
    target = ARTIFACT_ROOT / "smoke-downloads" / job_id / Path(path).name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(contents)
    return target


def download_and_verify_artifacts(client: SmokeHttpClient, job_id: str, result: dict[str, Any]) -> int:
    artifacts = result.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != 4:
        raise AssertionError("OpenFOAM did not return the complete four-artifact manifest.")
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            raise AssertionError("OpenFOAM artifact metadata is malformed.")
        download_artifact(client, job_id, artifact)
    return len(artifacts)


def start_service() -> tuple[subprocess.Popen[str], SmokeHttpClient]:
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    port = reserve_port()
    token = secrets.token_urlsafe(32)
    environment = os.environ.copy()
    environment.update({
        "WORKER_HOST": "127.0.0.1",
        "WORKER_PORT": str(port),
        "WORKER_API_TOKEN": token,
        "OPENFOAM_ARTIFACT_DIR": str(ARTIFACT_ROOT),
    })
    process = subprocess.Popen(
        [sys.executable, str(SERVICE)],
        cwd=str(SERVICE.parent),
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    client = SmokeHttpClient(f"http://127.0.0.1:{port}", token)
    return process, client


def submit_benchmark(client: SmokeHttpClient, request: dict[str, Any]) -> None:
    client.assert_unauthenticated_post_rejected("/v1/jobs", request)
    accepted = client.request_json(
        "/v1/jobs", request, RequestOptions(method="POST", timeout=10)
    )
    if not accepted.get("accepted") or accepted.get("jobId") != request["id"]:
        raise AssertionError(f"OpenFOAM job was not accepted: {accepted}")


def persist_smoke_receipts(request: dict[str, Any], result: dict[str, Any]) -> None:
    (ARTIFACT_ROOT / "request.json").write_text(
        json.dumps(request["inputs"], separators=(",", ":")), encoding="utf-8"
    )
    (ARTIFACT_ROOT / "response.json").write_text(
        json.dumps(result, separators=(",", ":"), allow_nan=False), encoding="utf-8"
    )


def stop_service(process: subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def run_smoke() -> None:
    process, client = start_service()
    try:
        wait_for_service(client, process)
        request = benchmark_request()
        submit_benchmark(client, request)
        job = wait_for_job(client, request["id"])
        result = require_successful_cfd_result(job, request)
        artifact_count = download_and_verify_artifacts(client, request["id"], result)
        persist_smoke_receipts(request, result)
        print(json.dumps({
            "event": "openfoam_async_service_smoke_passed",
            "jobId": request["id"],
            "status": job["status"],
            "solverVersion": result["solverVersion"],
            "meshCells": result["meshCells"],
            "artifactCount": artifact_count,
        }), flush=True)
    finally:
        stop_service(process)


if __name__ == "__main__":
    run_smoke()
