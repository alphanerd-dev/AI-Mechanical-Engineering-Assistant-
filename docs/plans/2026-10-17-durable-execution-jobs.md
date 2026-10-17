# V2.0.29 — Durable execution jobs and recovery

## Decision

Use the existing Supabase/Postgres boundary as the durable source of truth for execution-job state. The job row is both the queue record and the result/provenance envelope. A separate worker process claims jobs through a narrow service-role-only RPC and renews a fenced lease while executing. No new agent framework or second workflow state machine is introduced.

## Rollout gate\n\nThe durable route is disabled unless `DURABLE_EXECUTION_ENABLED=true`. While the flag is unset/false, POST preserves the pre-existing synchronous execution path and the new job-status/cancel routes return 404. Do not enable the flag until the V2.0.29 schema is applied through the reviewed migration process and a persistent worker is deployed and health-checked. This prevents a code-only deploy from pointing the live API at a table or worker that does not yet exist.\n\n## Lifecycle

1. API validates project UUID, backend/capability allowlist, bounded JSON inputs, and Idempotency-Key.
2. API authorizes TASK.EXECUTE and project membership, then writes a QUEUED job through the server-only service-role store.
3. Same owner/project/key plus same canonical request returns the existing job. Reusing the key for different input returns 409.
4. Worker claims one queued or expired-lease job with FOR UPDATE SKIP LOCKED. Claim increments attempts and records worker ID, lease token and expiry.
5. Worker heartbeats its lease and checks cancellation. Only the current worker ID/token can finalize the row.
6. Timeout, cancellation, bounded retry, terminal failure and successful output states are persisted.
7. Project-authorized GET reads the result/status; DELETE records cancellation.

## Retry boundary

Supported adapters for this API are allowlisted deterministic computations: ANALYSIS.SHAFT_TORQUE and declared Python numerical capabilities. They are retry-safe because repeating the same request has no external engineering side effect. Retry count is server-controlled and capped at three by default. Provider-declared failure is terminal; transport/time-limit errors can retry only for adapters that declare retry safety. Database fencing prevents stale-result writes, but does not make arbitrary external side effects exactly-once.

## Security

- Jobs belong to an existing project and a trusted owner identity.
- Submission requires TASK.EXECUTE; status requires PROJECT.READ; cancellation requires TASK.EXECUTE.
- Client roles cannot access the job table or claim RPC. Routes authorize first and use a server-only store; worker service-role credentials remain in the persistent worker service.
- Job IDs and idempotency keys are not authorization. Reads/cancellation filter by both job ID and project ID.
- Inputs are capped at 64 KB and backend/capability choices are allowlisted.
- Job SUCCEEDED is execution completion, not engineering verification.

## Rollout

1. Reconcile existing remote Supabase migration-ledger timestamp drift with the supported workflow; do not run supabase db push until it is aligned.
2. Apply migration V2.0.29 through the reviewed migration process.
3. Deploy this app revision and worker with matching schema/runtime configuration.
4. Test cross-project read/cancel denial, idempotency replay/conflict, QUEUED-to-terminal lifecycle, cancellation, expired-lease recovery, and exhausted retry budget.
5. Confirm service-role credentials are never exposed to browser/client environments.
6. Record exact deployed app/worker revisions and post-deploy test evidence.

This source change does not apply the schema or deploy a persistent worker service. The feature stays disabled by default until the schema/worker rollout gate is satisfied.
