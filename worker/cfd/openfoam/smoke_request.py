#!/usr/bin/env python3
"""Container-local HTTP smoke test for the real OpenFOAM 14 solver worker."""

import hashlib
import json
import os
import tempfile
import threading
import urllib.request
from urllib.error import HTTPError
from http.server import HTTPServer
from pathlib import Path

os.environ["OPENFOAM_WORKER_TOKEN"] = os.environ.get("OPENFOAM_WORKER_TOKEN", "ci-openfoam-token")

import worker  # noqa: E402


def request_json(url: str, token: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read())


def main() -> None:
    token = os.environ["OPENFOAM_WORKER_TOKEN"]
    request = {
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
    worker.WORKER_TOKEN = token
    with tempfile.TemporaryDirectory(prefix="openfoam-smoke-") as temporary:
        worker.ARTIFACT_ROOT = Path(temporary) / "artifacts"
        worker.ARTIFACT_ROOT.mkdir(parents=True)
        server = HTTPServer(("127.0.0.1", 0), worker.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            health = request_json(f"{base_url}/health", token)
            assert health["ready"] is True
            assert health["solverVersion"] == "14"

            unauthenticated = urllib.request.Request(
                f"{base_url}/v1/cfd/laminar-channel",
                data=json.dumps(request).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                urllib.request.urlopen(unauthenticated, timeout=5)
                raise AssertionError("Unauthenticated CFD requests must be rejected.")
            except HTTPError as error:
                assert error.code == 401

            payload = json.dumps(request).encode("utf-8")
            http_request = urllib.request.Request(
                f"{base_url}/v1/cfd/laminar-channel",
                data=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(http_request, timeout=330) as response:
                result = json.loads(response.read())

            assert result["status"] == "COMPLETED", result
            assert result["solver"] == "OpenFOAM"
            assert result["solverVersion"] == "14"
            assert result["meshCells"] == request["mesh"]["cellsVertical"]
            assert result["jobId"]
            assert len(result["velocityProfile"]) >= 20
            assert len(result["artifacts"]) == 4

            for artifact in result["artifacts"]:
                filename = Path(artifact["path"]).name
                artifact_request = urllib.request.Request(
                    f"{base_url}/v1/cfd/artifacts/{result['jobId']}/{filename}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                with urllib.request.urlopen(artifact_request, timeout=30) as response:
                    contents = response.read()
                assert hashlib.sha256(contents).hexdigest() == artifact["sha256"]
                destination = Path(os.environ.get("OPENFOAM_ARTIFACT_DIR", "/artifacts")) / filename
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(contents)

            output_dir = Path(os.environ.get("OPENFOAM_ARTIFACT_DIR", "/artifacts"))
            (output_dir / "request.json").write_text(json.dumps(request), encoding="utf-8")
            (output_dir / "response.json").write_text(json.dumps(result), encoding="utf-8")
            print(json.dumps({
                "status": result["status"],
                "converged": result["converged"],
                "meshCells": result["meshCells"],
                "massFluxKgS": result["massFluxKgS"],
                "residuals": result["residuals"],
                "artifactCount": len(result["artifacts"]),
            }))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    main()
