# Python Engineering Worker

The Python worker is an allowlisted numerical execution service for the Engineering Core.

## Local reference service

Install dependencies:

    python -m pip install -r worker/python/requirements.txt

Start the HTTP service:

    PYTHONPATH=worker/python python worker/python/service.py

It exposes POST /v1/jobs to submit an allowlisted computation, GET /v1/jobs/{id} to inspect status, and DELETE /v1/jobs/{id} to request cancellation. Set WORKER_API_TOKEN to require a bearer token.

The service's default in-memory job store is a reference implementation, not production durability. Repeated submission of the same job ID and same request is idempotent within one process; reusing the ID for a different request is rejected.

## Production boundary

Run this service separately from Next.js. Production needs container/VM isolation, CPU/memory/process/filesystem limits, network egress policy, authentication, durable queue/job storage, artifact storage, timeout/cancellation enforcement, and structured audit/evidence persistence.

The V2.0.29 execution API stores durable job state in Supabase/Postgres; the separate Node poller dispatches allowlisted work. That does not make this Python reference service's own status cache durable. The worker must remain capability-allowlisted and must never become an arbitrary Python execution endpoint.

Mathematical correctness does not establish engineering correctness; assumptions, inputs, models and validation evidence remain separate concerns.
