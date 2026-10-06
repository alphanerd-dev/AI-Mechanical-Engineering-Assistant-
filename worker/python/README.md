# Python Engineering Worker

The Python worker is an allowlisted numerical execution service for the Engineering Core.

## Local reference service

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Start the HTTP service:

```bash
PYTHONPATH=worker/python python worker/python/service.py
```

It exposes:

- `POST /v1/jobs` — submit an allowlisted computation
- `GET /v1/jobs/{id}` — inspect execution status

Set `WORKER_API_TOKEN` to require a bearer token. The default in-memory job store is intentionally a reference implementation, not production durability.

## Production boundary

Run the worker separately from the Next.js/Engineering Core process. The production deployment should provide:

- container or VM isolation
- CPU, memory, process and filesystem limits
- network egress policy
- authentication between Core and worker
- durable queue/job storage
- artifact storage
- execution timeout/cancellation enforcement
- structured audit/evidence persistence

The worker must remain capability-allowlisted. It must never become an arbitrary Python execution endpoint.

Mathematical correctness does not establish engineering correctness; assumptions, inputs, models and validation evidence remain separate concerns.
