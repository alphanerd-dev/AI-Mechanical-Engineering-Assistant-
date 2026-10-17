# Execution layer

The execution API now separates durable job submission from provider execution.

## Request lifecycle

- With `DURABLE_EXECUTION_ENABLED=true`, POST /api/execution authorizes TASK.EXECUTE and project membership, validates an allowlisted backend/capability and bounded request body, then durably stores a QUEUED job. With the flag disabled or unset, the existing synchronous flow is preserved.
- A stable Idempotency-Key is required. Same key plus same canonical request returns the existing job; reuse with different input returns 409.
- GET /api/execution/{jobId}?projectId=... requires PROJECT.READ for the project.
- DELETE /api/execution/{jobId}?projectId=... requires TASK.EXECUTE. Queued jobs cancel immediately; running jobs record a cancellation request checked by the worker heartbeat.
- npm run worker:execution runs the independent Node worker process. It claims work via the service-role-only Postgres RPC, renews a lease using the database clock (never the worker host clock), and writes results only while the worker ID and fencing token still match.
- Expired worker leases are recoverable. Retries are bounded (default 3 attempts) and limited to adapters declared retry-safe. Provider-declared failure is terminal.

## Operations and limits

Run the worker as a dedicated persistent process, not in a Next.js request handler. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and optionally EXECUTION_WORKER_ID, EXECUTION_WORKER_POLL_INTERVAL_MS, EXECUTION_WORKER_LEASE_SECONDS, and EXECUTION_WORKER_HEARTBEAT_MS. Set PYTHON_WORKER_URL and PYTHON_WORKER_API_TOKEN to enable the allowlisted Python numerical adapter.

Supported API capabilities are intentionally narrow: ANALYSIS.SHAFT_TORQUE on the TypeScript adapter and the explicitly allowlisted numerical capabilities on the Python worker. The worker currently retries only transport/time-limit failures on these deterministic computations. New non-idempotent adapters must not declare retrySafe without a provider-specific idempotency contract.

Execution SUCCEEDED means the backend completed; it does not mean engineering correctness or physical safety is verified. Capability-specific validators and evidence contracts remain authoritative.

Migration V2.0.29 is committed for review and has not been applied. Reconcile existing remote Supabase migration-ledger drift before applying it to any shared/production project. Production is not durably operational until the schema is applied and a persistent worker service is deployed and verified.
