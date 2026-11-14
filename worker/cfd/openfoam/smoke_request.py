#!/usr/bin/env python3
"""Container-local HTTP smoke test for the real OpenFOAM 14 solver worker."""

import hashlib
from dataclasses import dataclass
import json
import os
import tempfile
import threading
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from urllib.error import HTTPError

os.environ["OPENFOAM_WORKER_TOKEN"] = os.environ.get("OPENFOAM_WORKER_TOKEN", "ci-openfoam-token")

import worker  # noqa: E402


def benchmark_request() -> dict:
    return {
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
            "timeoutSeconds": 300,
        },
    }


def request_json(url: str, token: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read())


def assert_worker_ready(base_url: str, token: str) -> None:
    health = request_json(f"{base_url}/health", token)
    assert health["ready"] is True
    assert health["solverVersion"] == "14"


def assert_authentication_required(base_url: str, request_payload: dict) -> None:
    request = urllib.request.Request(
        f"{base_url}/v1/cfd/laminar-channel",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=5)
    except HTTPError as error:
        assert error.code == 401
        return
    raise AssertionError("Unauthenticated CFD requests must be rejected.")


def execute_benchmark(base_url: str, token: str, request_payload: dict) -> dict:
    request = urllib.request.Request(
        f"{base_url}/v1/cfd/laminar-channel",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=330) as response:
            result = json.loads(response.read())
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"OpenFOAM worker returned HTTP {error.code}: {response_body}"
        ) from error
    assert result["status"] == "COMPLETED", result
    assert result["solver"] == "OpenFOAM"
    assert result["solverVersion"] == "14"
    assert result["meshCells"] == request_payload["mesh"]["cellsVertical"]
    assert result["jobId"]
    assert len(result["velocityProfile"]) >= 20
    assert len(result["artifacts"]) == 4
    return result


@dataclass(frozen=True)
class ArtifactDownloadContext:
    base_url: str
    token: str
    output_dir: Path


def download_artifact(
    context: ArtifactDownloadContext,
    job_id: str,
    artifact: dict,
) -> None:
    filename = Path(artifact["path"]).name
    request = urllib.request.Request(
        f"{context.base_url}/v1/cfd/artifacts/{job_id}/{filename}",
        headers={"Authorization": f"Bearer {context.token}"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        contents = response.read()
    digest = hashlib.sha256(contents).hexdigest()
    assert digest == artifact["sha256"], f"SHA-256 mismatch for {filename}"
    context.output_dir.mkdir(parents=True, exist_ok=True)
    (context.output_dir / filename).write_bytes(contents)


def verify_and_download_artifacts(
    context: ArtifactDownloadContext,
    result: dict,
) -> None:
    for artifact in result["artifacts"]:
        download_artifact(context, result["jobId"], artifact)


def persist_smoke_result(request_payload: dict, result: dict, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "request.json").write_text(json.dumps(request_payload), encoding="utf-8")
    (output_dir / "response.json").write_text(json.dumps(result), encoding="utf-8")
    summary = {
        "status": result["status"],
        "converged": result["converged"],
        "meshCells": result["meshCells"],
        "massFluxKgS": result["massFluxKgS"],
        "residuals": result["residuals"],
        "artifactCount": len(result["artifacts"])
    }
    print(json.dumps(summary))


def run_smoke_test(token: str, output_dir: Path) -> None:
    request_payload = benchmark_request()
    with tempfile.TemporaryDirectory(prefix="openfoam-smoke-") as temporary:
        worker.ARTIFACT_ROOT = Path(temporary) / "artifacts"
        worker.ARTIFACT_ROOT.mkdir(parents=True)
        server = HTTPServer(("127.0.0.1", 0), worker.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            print("[openfoam-smoke] checking authenticated worker health", flush=True)
            assert_worker_ready(base_url, token)
            print("[openfoam-smoke] health check passed", flush=True)
            assert_authentication_required(base_url, request_payload)
            print("[openfoam-smoke] unauthenticated request correctly rejected", flush=True)
            result = execute_benchmark(base_url, token, request_payload)
            persist_smoke_result(request_payload, result, output_dir)
            print("[openfoam-smoke] solver completed; response persisted before artifact verification", flush=True)
            download_context = ArtifactDownloadContext(base_url, token, output_dir)
            verify_and_download_artifacts(download_context, result)
            print("[openfoam-smoke] all artifact downloads and SHA-256 checks passed", flush=True)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


def main() -> None:
    Path.home().mkdir(parents=True, exist_ok=True)
    token = os.environ["OPENFOAM_WORKER_TOKEN"]
    worker.WORKER_TOKEN = token
    worker.FOAM_VERSION = worker.detect_openfoam_version()
    output_dir = Path(os.environ.get("OPENFOAM_ARTIFACT_DIR", "/artifacts"))
    try:
        run_smoke_test(token, output_dir)
    except Exception as error:
        print(f"[openfoam-smoke] failed: {type(error).__name__}: {error}", flush=True)
        raise


if __name__ == "__main__":
    main()
