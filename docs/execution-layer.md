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

V2.0.29 and V2.0.30, together with the G2/M2 schema migrations, are applied to both the production and dedicated E2E Supabase projects. As of 18 November 2026, all 32 repository migration versions match both remote ledgers. V2.0.31–V2.0.33 add the server-only agent-run journal, its least-privilege ACL correction and the approval-evidence project-ID type fix.

The production `engineering_execution_jobs` table contains one historical `SUCCEEDED` record and no queued or running jobs. The agent-run journal table is empty. Production `DURABLE_EXECUTION_ENABLED` is deliberately `false`, and no persistent durable execution worker service is deployed. Do not enable the flag until the persistent worker, authenticated orchestration, approval evidence and recovery acceptance gates have passed.


## Bounded solver workers and evidence acceptance (PR #168)

The durable execution route now supports two additional fixed-purpose worker contracts. These are not general-purpose code execution endpoints.

### CalculiX static structural worker

- The accepted request is limited to the versioned `cantilever_box` reference benchmark and a bounded material, geometry, load and element-size contract.
- The API validates benchmark identity, positive finite dimensions/material properties, cantilever slenderness and an estimated tetrahedral element ceiling before queueing.
- The isolated CalculiX worker validates the request again, executes the pinned solver runtime, normalizes the result and emits a SHA-256 artifact manifest.
- Acceptance independently compares normalized displacement and support reactions with the analytical reference, checks recorded relative errors and validates the required model/result artifact kinds and confined relative paths.
- A solver process exit of zero is not itself an engineering PASS. The benchmark validator remains the acceptance authority.

### OpenFOAM 14 laminar-channel worker

- The service accepts a fixed laminar-channel case contract; it does not accept arbitrary OpenFOAM dictionaries or user-supplied source code.
- Submission is asynchronous and idempotent. Job state and artifacts are persisted separately from the worker process; active jobs found during restart require reconciliation rather than automatic replay.
- The worker builds the case from validated inputs, enforces a wall-clock budget across solver tools, validates mesh/result measurements and persists only the named output artifacts.
- Artifact retrieval uses an allowlisted filename set, normalized job identity and confined paths. The HTTP service requires a bearer token when bound beyond loopback.
- A completed OpenFOAM process is not an engineering PASS. The normalized CFD result and request/mesh consistency checks remain separate.

### Execution and approval boundary

AI may select an allowlisted capability and prepare a typed request. It does not supply executable solver scripts or unrestricted solver dictionaries. The worker performs deterministic execution; the application validates the returned contract; evidence persistence records the exact artifacts; project authorization and any required evidence-write authorization remain separate.

The preliminary shaft drawing generator is similarly source-bound: it accepts only a current accepted geometry revision, verifies canonical artifact identity/digest/storage binding, checks the trusted geometry receipt and axis dimension evidence, and labels the SVG as preliminary/not for manufacture. Drawing generation does not validate drafting standards or approve a design.

### PR #168 verification state — 18 November 2026

Current branch: `implementation/next-engineering-cycle-2026-11-15`; current verified head at the last recorded check: `21c9474eb87c680e043eb40aa724da5bea7262ca`.

- ESLint and CodeQL Advanced passed on the current head.
- The isolated local Supabase stack replayed all 32 migrations successfully.
- The M0 Preview deployment is READY. The application preview build is being monitored separately.
- The full Engineering Core CI is still in progress; do not mark the PR fully verified until the exact-head workflow concludes.
- The Codacy workflow completed, but its analysis and SARIF steps were skipped because Codacy is not configured.
- CodeScene automated approvals are recorded; no independent human review is recorded. A previous Codex review attempt was blocked by its usage limit.
- Production Supabase schema and ledger migrations are applied. Production's durable-execution feature flag is disabled and the persistent worker is not deployed.

A Vercel production redeployment of the unchanged `main` commit `e1cbac7bcdc9ce9cebeace7a056e2ed414c37a23` was created after setting `DURABLE_EXECUTION_ENABLED=false`; it reached READY. This is a safety redeployment of the existing mainline code, not a merge or deployment of PR #168.

Do not infer production readiness of durable execution from the existence of the journal table or from solver benchmark CI. The authenticated worker lifecycle remains a separate acceptance gate.
