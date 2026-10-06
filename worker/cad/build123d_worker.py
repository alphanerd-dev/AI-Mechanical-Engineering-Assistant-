#!/usr/bin/env python3
"""Controlled build123d CAD worker.

Protocol: one JSON request on stdin -> one JSON response on stdout.
Generated source is written to an isolated artifact directory and executed
with a restricted environment. The worker itself does not provide shell or
network access to generated code.
"""
import json, os, pathlib, subprocess, sys, tempfile

ALLOWED_BACKENDS={"build123d"}
MAX_SOURCE_BYTES=250_000

def fail(message):
    print(json.dumps({"success":False,"backend":"build123d","warnings":[],"error":message}))
    raise SystemExit(1)

def main():
    raw=sys.stdin.read()
    if len(raw)>MAX_SOURCE_BYTES+10_000: fail("Request is too large.")
    try: request=json.loads(raw)
    except json.JSONDecodeError: fail("Invalid JSON request.")
    source=request.get("source")
    if not isinstance(source,str) or not source.strip(): fail("CAD source is required.")
    if len(source.encode("utf-8"))>MAX_SOURCE_BYTES: fail("CAD source exceeds worker limit.")
    if request.get("backend") not in ALLOWED_BACKENDS: fail("Backend is not allowed.")
    filename=pathlib.Path(str(request.get("filename","generated.py"))).name
    artifact_dir=pathlib.Path(os.environ.get("CAD_ARTIFACT_DIR", tempfile.mkdtemp(prefix="cad-artifacts-")))
    artifact_dir.mkdir(parents=True,exist_ok=True)
    source_path=artifact_dir/filename
    source_path.write_text(source,encoding="utf-8")
    env={"PATH":os.environ.get("PATH","") ,"PYTHONUNBUFFERED":"1","CAD_ARTIFACT_DIR":str(artifact_dir)}
    try:
        completed=subprocess.run([sys.executable,str(source_path)],cwd=str(artifact_dir),env=env,capture_output=True,text=True,timeout=float(request.get("timeoutMs",30000))/1000,shell=False)
    except subprocess.TimeoutExpired:
        fail("CAD worker timed out.")
    if completed.returncode!=0:
        print(json.dumps({"success":False,"backend":"build123d","sourceArtifactPath":str(source_path),"stdout":completed.stdout[-20_000:],"stderr":completed.stderr[-20_000:],"warnings":[],"error":"Generated CAD program failed."}))
        raise SystemExit(1)
    result={"success":True,"backend":"build123d","sourceArtifactPath":str(source_path),"stdout":completed.stdout[-20_000:],"stderr":completed.stderr[-20_000:],"warnings":[]}
    for key in ("solidArtifactPath","stepArtifactPath","stlArtifactPath","threeMfArtifactPath"):
        value=os.environ.get(key)
        if value: result[key]=value
    print(json.dumps(result))

if __name__=="__main__": main()