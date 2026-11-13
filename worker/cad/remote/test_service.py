#!/usr/bin/env python3
"""End-to-end HTTP smoke test for the isolated remote CAD worker container."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:10000").rstrip("/")
TOKEN = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("WORKER_API_TOKEN", "")


def request(path: str, payload: dict | None = None, auth: bool = True, allow_error: bool = False):
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8") if payload is not None else None
    headers = {"accept": "application/json"}
    if raw is not None:
        headers["content-type"] = "application/json"
    if auth:
        headers["authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(BASE + path, data=raw, headers=headers, method="POST" if raw is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            body = json.loads(response.read())
            return response.status, body
    except urllib.error.HTTPError as exc:
        body = json.loads(exc.read() or b"{}")
        if allow_error:
            return exc.code, body
        raise AssertionError(f"{path} returned HTTP {exc.code}: {body}") from exc


def number_text(value: float) -> str:
    return f"{value:.9f}".rstrip("0").rstrip(".")


def source_template(name: str, diameter: float, length: float) -> str:
    return (
        "# Deterministic " + name + " generator; dimensions are millimetres.\n"
        "from pathlib import Path\n"
        "import json\n"
        "import os\n"
        "from build123d import Align, Cylinder, Mesher, export_brep, export_step, export_stl\n"
        "\n"
        "output_dir = Path(os.environ['CAD_ARTIFACT_DIR'])\n"
        "part = Cylinder(radius=" + number_text(diameter / 2) + ", height=" + number_text(length) + ", align=(Align.CENTER, Align.CENTER, Align.MIN))\n"
        "export_brep(part, output_dir / 'part.brep')\n"
        "export_step(part, output_dir / 'part.step')\n"
        "export_stl(part, output_dir / 'part.stl')\n"
        "mesher = Mesher()\n"
        "mesher.add_shape(part)\n"
        "mesher.write(output_dir / 'part.3mf')\n"
        "manifest = {\n"
        "    'schemaVersion': 1,\n"
        "    'artifacts': {\n"
        "        'solidArtifactPath': 'part.brep',\n"
        "        'stepArtifactPath': 'part.step',\n"
        "        'stlArtifactPath': 'part.stl',\n"
        "        'threeMfArtifactPath': 'part.3mf',\n"
        "    },\n"
        "}\n"
        "(output_dir / 'cad-artifacts.json').write_text(json.dumps(manifest), encoding='utf-8')\n"
    )


def wait_for_health() -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            code, health = request("/healthz", auth=False)
            if code == 200 and health.get("status") == "ok":
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise AssertionError("Remote CAD worker did not become healthy within 90 seconds.")


def verify_readiness() -> None:
    code, readiness = request("/v1/readiness")
    assert code == 200 and readiness.get("ready") is True, readiness
    expected = {"CAD.CREATE_CYLINDER", "CAD.VALIDATE_BREP", "CAD.INSPECT_GEOMETRY", "CAD.TESSELLATE_GEOMETRY"}
    assert expected.issubset(set(readiness.get("capabilities", []))), readiness


def generate_cad_artifacts(dimensions: dict[str, object], source: str) -> dict:
    code, execution = request("/v1/cad/execute", {
        "id": "ci-cad-execution-001", "backend": "build123d", "source": source,
        "filename": "shaft.py", "timeoutMs": 60000, "parameters": dimensions
    })
    assert code == 200 and execution.get("success") is True, execution
    assert execution.get("executionId") == "ci-cad-execution-001"
    artifacts = execution.get("artifacts", {})
    assert set(artifacts) == {"source", "solid", "step", "stl", "threeMf"}
    verify_artifact_digests(artifacts)
    return artifacts


def verify_artifact_digests(artifacts: dict) -> None:
    for artifact in artifacts.values():
        raw = base64.b64decode(artifact["contentBase64"], validate=True)
        assert len(raw) == artifact["sizeBytes"] > 0
        assert hashlib.sha256(raw).hexdigest() == artifact["sha256"]


def verify_brep_validation(solid: bytes, dimensions: dict[str, object]) -> None:
    digest = hashlib.sha256(solid).hexdigest()
    code, verdict = request("/v1/cad/validate", {
        "artifactBase64": base64.b64encode(solid).decode("ascii"),
        "artifactSha256": digest, "parameters": dimensions, "toleranceMm": 0.01
    })
    assert code == 200 and verdict.get("valid") is True, verdict
    assert verdict.get("solidCount") == 1 and verdict.get("checkedBy") == "occt.brepcheck"
    bounds = verdict["boundingBoxMm"]
    assert abs(bounds["x"] - 30.0) <= 0.01
    assert abs(bounds["y"] - 30.0) <= 0.01
    assert abs(bounds["z"] - 200.0) <= 0.01
    assert verdict["artifactSha256"] == digest
    assert all(item["passed"] for item in verdict["dimensionChecks"])


def verify_tessellation_mesh(geometry: dict) -> None:
    mesh = geometry["tessellation"]
    vertices = mesh["vertexCount"]
    triangles = mesh["triangleCount"]
    assert vertices >= 3 and triangles >= 1, geometry
    assert len(base64.b64decode(mesh["positionsFloat32LE"])) == vertices * 3 * 4
    assert len(base64.b64decode(mesh["normalsFloat32LE"])) == vertices * 3 * 4
    assert len(base64.b64decode(mesh["indicesUint32LE"])) == triangles * 3 * 4


def verify_geometry_operations(artifacts: dict) -> None:
    for geometry_format, artifact_key in (("BREP", "solid"), ("STEP", "step")):
        geometry_bytes = base64.b64decode(artifacts[artifact_key]["contentBase64"], validate=True)
        digest = hashlib.sha256(geometry_bytes).hexdigest()
        for operation in ("INSPECT", "TESSELLATE"):
            payload = {
                "operation": operation, "format": geometry_format,
                "artifactBase64": base64.b64encode(geometry_bytes).decode("ascii"),
                "artifactSha256": digest, "linearDeflectionMm": 0.1, "angularDeflectionRad": 0.35
            }
            code, geometry = request("/v1/cad/geometry", payload)
            assert code == 200 and geometry.get("status") == "COMPLETED", geometry
            assert geometry.get("artifactSha256") == digest, geometry
            assert geometry["topology"]["valid"] is True and geometry["topology"]["solids"] == 1, geometry
            if operation == "TESSELLATE":
                verify_tessellation_mesh(geometry)


def verify_rejections(source: str, dimensions: dict[str, object]) -> None:
    code, rejected = request("/v1/cad/execute", {
        "id": "ci-cad-execution-002", "backend": "build123d",
        "source": source + "raise RuntimeError('source must never execute')\\n",
        "filename": "shaft.py", "timeoutMs": 60000, "parameters": dimensions
    }, allow_error=True)
    assert code == 400 and "template" in str(rejected.get("error", "")).lower(), rejected
    code, unauthorized = request("/v1/cad/execute", {
        "id": "ci-cad-execution-003", "backend": "build123d", "source": source,
        "filename": "shaft.py", "timeoutMs": 60000, "parameters": dimensions
    }, auth=False, allow_error=True)
    assert code == 401, unauthorized


def main() -> None:
    wait_for_health()
    verify_readiness()
    dimensions = {"kind": "CYLINDER", "name": "shaft", "diameterMm": 30.0, "lengthMm": 200.0, "units": "mm"}
    source = source_template("shaft", 30.0, 200.0)
    artifacts = generate_cad_artifacts(dimensions, source)
    solid = base64.b64decode(artifacts["solid"]["contentBase64"], validate=True)
    verify_brep_validation(solid, dimensions)
    verify_geometry_operations(artifacts)
    verify_rejections(source, dimensions)
    print("remote CAD worker HTTP smoke passed: generate + digest checks + OCCT validation + geometry inspection/tessellation + rejection + bearer auth")


if __name__ == "__main__":
    main()
