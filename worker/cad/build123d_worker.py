#!/usr/bin/env python3
"""Controlled build123d CAD worker.

Protocol: one JSON request on stdin -> one JSON response on stdout.
Generated source is written to an isolated artifact directory and executed
with a restricted environment. Artifact paths are returned only from an
explicit manifest and must remain inside the artifact directory.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile

ALLOWED_BACKENDS={"build123d"}
MAX_SOURCE_BYTES=250_000
MANIFEST_NAME="cad-artifacts.json"
MANIFEST_VERSION=1
ALLOWED_ARTIFACT_KEYS={
    "solidArtifactPath",
    "stepArtifactPath",
    "stlArtifactPath",
    "threeMfArtifactPath",
}


def fail(message):
    print(json.dumps({
        "success":False,
        "backend":"build123d",
        "warnings":[],
        "error":message,
    }))
    raise SystemExit(1)


def _confined_file(root, value):
    if not isinstance(value,str) or not value.strip():
        raise ValueError("Artifact path must be a non-empty string.")
    root_resolved=root.resolve()
    candidate=(root/value).resolve()
    try:
        candidate.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError("Artifact path escapes the artifact directory.") from exc
    if not candidate.is_file():
        raise ValueError(f"Declared artifact does not exist: {value}.")
    return str(candidate)


def read_artifact_manifest(artifact_dir):
    manifest_path=artifact_dir/MANIFEST_NAME
    if not manifest_path.exists():
        return {}
    try:
        manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError,UnicodeDecodeError,json.JSONDecodeError) as exc:
        raise ValueError("CAD artifact manifest is invalid.") from exc
    if not isinstance(manifest,dict) or manifest.get("schemaVersion")!=MANIFEST_VERSION:
        raise ValueError("CAD artifact manifest schema version is unsupported.")
    artifacts=manifest.get("artifacts")
    if artifacts is None:
        return {}
    if not isinstance(artifacts,dict):
        raise ValueError("CAD artifact manifest artifacts must be an object.")
    unknown=set(artifacts)-ALLOWED_ARTIFACT_KEYS
    if unknown:
        raise ValueError("CAD artifact manifest contains unsupported artifact keys.")
    return {
        key:_confined_file(artifact_dir,value)
        for key,value in artifacts.items()
    }


def main():
    raw=sys.stdin.read()
    if len(raw)>MAX_SOURCE_BYTES+10_000:
        fail("Request is too large.")
    try:
        request=json.loads(raw)
    except json.JSONDecodeError:
        fail("Invalid JSON request.")
    source=request.get("source")
    if not isinstance(source,str) or not source.strip():
        fail("CAD source is required.")
    if len(source.encode("utf-8"))>MAX_SOURCE_BYTES:
        fail("CAD source exceeds worker limit.")
    if request.get("backend") not in ALLOWED_BACKENDS:
        fail("Backend is not allowed.")

    filename=pathlib.Path(str(request.get("filename","generated.py"))).name
    artifact_dir=pathlib.Path(
        os.environ.get("CAD_ARTIFACT_DIR", tempfile.mkdtemp(prefix="cad-artifacts-"))
    )
    artifact_dir.mkdir(parents=True,exist_ok=True)
    source_path=artifact_dir/filename
    source_path.write_text(source,encoding="utf-8")

    env={
        "PATH":os.environ.get("PATH",""),
        "PYTHONUNBUFFERED":"1",
        "PYTHONDONTWRITEBYTECODE":"1",
        "CAD_ARTIFACT_DIR":str(artifact_dir),
    }

    try:
        completed=subprocess.run(
            [sys.executable,str(source_path)],
            cwd=str(artifact_dir),
            env=env,
            capture_output=True,
            text=True,
            timeout=float(request.get("timeoutMs",30000))/1000,
            shell=False,
        )
    except subprocess.TimeoutExpired:
        fail("CAD worker timed out.")

    if completed.returncode!=0:
        print(json.dumps({
            "success":False,
            "backend":"build123d",
            "sourceArtifactPath":str(source_path),
            "stdout":completed.stdout[-20_000:],
            "stderr":completed.stderr[-20_000:],
            "warnings":[],
            "error":"Generated CAD program failed.",
        }))
        raise SystemExit(1)

    try:
        manifest=read_artifact_manifest(artifact_dir)
    except ValueError as exc:
        fail(str(exc))

    result={
        "success":True,
        "backend":"build123d",
        "sourceArtifactPath":str(source_path),
        "stdout":completed.stdout[-20_000:],
        "stderr":completed.stderr[-20_000:],
        "warnings":[],
    }
    result.update(manifest)
    print(json.dumps(result))


if __name__=="__main__":
    main()
