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
from pathlib import Path

SERVICE = Path(__file__).with_name("service.py")
ARTIFACT_ROOT = Path(os.environ.get("OPENFOAM_ARTIFACT_DIR", "/artifacts"))
SOLVER_TIMEOUT_SECONDS = 300
EXECUTION_TIMEOUT_MS = (SOLVER_TIMEOUT_SECONDS + 120) * 1000


def reserve_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def request_json(url: str, token: str | None = None, payload: dict | None = None, method: str = "GET", timeout: float = 10) -> dict:
    headers = {}
    data = None
    if token:
        headers["Authorization"] = "Bearer " + token
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} from {url}: {body}") from error


def benchmark_request() -> dict:
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


def wait_for_service(base_url: str, process: subprocess.Popen) -> None:
    deadline = time.monotonic() + 30
    last_error = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"OpenFOAM service exited during startup with code {process.returncode}.")
        try:
            health = request_json(base_url + "/health")
            if health.get("status") == "ok" and health.get("provider") == "openfoam14":
                return
        except Exception as error:
            last_error = error
        time.sleep(0.25)
    raise RuntimeError(f"OpenFOAM service did not become healthy: {last_error}")


def assert_authentication(base_url: str, request_payload: dict) -> None:
    body = json.dumps(request_payload).encode("utf-8")
    request = urllib.request.Request(
        base_url + "/v1/jobs",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=5)
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise AssertionError(f"Expected HTTP 401, received HTTP {error.code}.") from error
        return
    raise AssertionError("Unauthenticated OpenFOAM job submission was accepted.")


def wait_for_job(base_url: str, token: str, job_id: str) -> dict:
    deadline = time.monotonic() + (EXECUTION_TIMEOUT_MS / 1000) + 60
    while time.monotonic() < deadline:
        job = request_json(base_url + "/v1/jobs/" + urllib.parse.quote(job_id), token=token, timeout=10)
        status = job.get("status")
        if status in {"SUCCEEDED", "FAILED", "CANCELLED"}:
            return job
        time.sleep(1)
    raise TimeoutError("OpenFOAM durable job did not reach a terminal state within its execution budget.")


def download_and_verify_artifacts(base_url: str, token: str, job_id: str, result: dict) -> int:
    artifacts = result.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != 4:
        raise AssertionError("OpenFOAM did not return the complete four-artifact manifest.")
    downloaded = ARTIFACT_ROOT / "smoke-downloads" / job_id
    downloaded.mkdir(parents=True, exist_ok=True)
    for artifact in artifacts:
        path = artifact.get("path")
        expected = artifact.get("sha256")
        if not isinstance(path, str) or not isinstance(expected, str):
            raise AssertionError("OpenFOAM artifact metadata is malformed.")
        encoded_path = urllib.parse.quote(path, safe="/")
        url = base_url + "/v1/jobs/" + urllib.parse.quote(job_id) + "/artifacts/" + encoded_path
        request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(request, timeout=45) as response:
            contents = response.read()
        digest = hashlib.sha256(contents).hexdigest()
        if digest != expected:
            raise AssertionError(f"SHA-256 mismatch for OpenFOAM artifact {path}.")
        name = Path(path).name
        (downloaded / name).write_bytes(contents)
    return len(artifacts)


def run_smoke() -> None:
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
    base_url = f"http://127.0.0.1:{port}"
    try:
        wait_for_service(base_url, process)
        request_payload = benchmark_request()
        assert_authentication(base_url, request_payload)
        accepted = request_json(base_url + "/v1/jobs", token, request_payload, method="POST", timeout=10)
        if not accepted.get("accepted") or accepted.get("jobId") != request_payload["id"]:
            raise AssertionError(f"OpenFOAM job was not accepted: {accepted}")
        job = wait_for_job(base_url, token, request_payload["id"])
        if job.get("status") != "SUCCEEDED":
            raise RuntimeError(f"OpenFOAM service job failed: {job.get('error') or job}")
        execution = job.get("result")
        if not isinstance(execution, dict) or execution.get("success") is not True:
            raise AssertionError("OpenFOAM service did not return a successful execution result.")
        result = execution.get("outputs", {}).get("cfdResult")
        if not isinstance(result, dict):
            raise AssertionError("OpenFOAM service did not return a typed CFD result.")
        if result.get("status") != "COMPLETED" or result.get("solverVersion") != "14":
            raise AssertionError("OpenFOAM solver completion or version identity is invalid.")
        if result.get("meshCells") != request_payload["inputs"]["mesh"]["cellsVertical"]:
            raise AssertionError("OpenFOAM mesh cardinality does not match the request.")
        if len(result.get("velocityProfile", [])) < 20:
            raise AssertionError("OpenFOAM velocity profile is incomplete.")
        artifact_count = download_and_verify_artifacts(base_url, token, request_payload["id"], result)
        (ARTIFACT_ROOT / "request.json").write_text(
            json.dumps(request_payload["inputs"], separators=(",", ":")), encoding="utf-8"
        )
        (ARTIFACT_ROOT / "response.json").write_text(
            json.dumps(result, separators=(",", ":"), allow_nan=False), encoding="utf-8"
        )
        print(json.dumps({
            "event": "openfoam_async_service_smoke_passed",
            "jobId": request_payload["id"],
            "status": job["status"],
            "solverVersion": result["solverVersion"],
            "meshCells": result["meshCells"],
            "artifactCount": artifact_count,
        }), flush=True)
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    run_smoke()
