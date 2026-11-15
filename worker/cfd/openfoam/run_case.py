#!/usr/bin/env python3
"""CLI entrypoint used by the asynchronous OpenFOAM job supervisor."""
from __future__ import annotations

import json
import os
import sys

from worker import WorkerError, execute_case, validate_request

MAX_REQUEST_BYTES = 1_000_000


def main() -> int:
    raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        print(json.dumps({"status": "FAILED", "error": "Request exceeds 1 MiB."}))
        return 1
    try:
        request = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        print(json.dumps({"status": "FAILED", "error": "Request must be valid UTF-8 JSON."}))
        return 1
    errors = validate_request(request)
    if errors:
        print(json.dumps({"status": "FAILED", "error": "; ".join(errors)}))
        return 1
    job_id = os.environ.get("OPENFOAM_JOB_ID")
    try:
        result = execute_case(request, job_id=job_id, prune=False)
        print(json.dumps(result, separators=(",", ":"), allow_nan=False))
        return 0 if result.get("status") == "COMPLETED" else 1
    except (WorkerError, OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({"status": "FAILED", "jobId": job_id, "error": str(exc)[:2000]}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
