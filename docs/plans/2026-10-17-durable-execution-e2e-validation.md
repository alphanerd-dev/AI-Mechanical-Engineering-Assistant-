# V2.0.29 durable execution E2E validation record

**Date:** 2026-10-17  
**Environment:** Dedicated Supabase project `AI-Mechanical-Engineering-Assistant-E2E`  
**Migration:** `20261017104855_v2_0_29_durable_execution_jobs`

## Scope

The migration was applied to the dedicated E2E database, not the production Supabase project. The created job table was confirmed to have row-level security enabled and the expected owner/project foreign keys, request/idempotency fields, terminal states, retry metadata, result/provenance fields, and fencing-lease columns.

## Database contract checks

A short-lived test inside a PostgreSQL `DO` block completed successfully:

- Inserted one queued numerical job referencing an existing E2E project and owner.
- Called `claim_engineering_execution_job`; the job transitioned to `RUNNING` with a non-null lease token and future expiry.
- Attempted another claim while the first lease remained active; the job was not returned a second time.
- Finalized the job using the current worker ID and fencing token; the update succeeded.
- Reusing an owner/project/idempotency key was rejected by the database unique constraint.
- Reclaimed an expired retryable lease with an incremented attempt counter and a different fencing token.
- Marked an expired job `FAILED` when its retry budget was exhausted.
- Marked an expired job `CANCELLED` when cancellation had already been requested.
- Inserted a queued job and confirmed the queued-to-`CANCELLED` transition satisfies the table constraints.
- Deleted every temporary row within the test block. A follow-up count query confirmed the E2E job table was empty.

A separate privilege query also passed: `anon` and `authenticated` have no SELECT, INSERT or UPDATE grants on `engineering_execution_jobs` and cannot execute `claim_engineering_execution_job(text,integer)`; `service_role` has the expected table grants and can execute the claim RPC. The table's informational Supabase `RLS Enabled No Policy` finding is intentional because direct client access is revoked and only the server-side service role uses this store. The E2E Auth advisor also reports leaked-password protection disabled; that is an existing project-level hardening issue and was not modified by this work.

This validates the database schema and claim/fencing/cancellation contract against a live E2E database. It does **not** validate the deployed Next.js API against an authenticated user or prove a persistent worker is running.

## Remaining rollout gates

- Production migration history remains out of sync with local migration timestamps; do not apply this migration to production until that discrepancy is reconciled using the reviewed Supabase migration workflow.
- The durable API remains disabled unless `DURABLE_EXECUTION_ENABLED=true`.
- Deploy and health-check the separate persistent worker in a dedicated runtime before enabling durable execution in a shared environment.
- Run authenticated end-to-end API checks for authorization, idempotency replay/conflict, status polling, cancellation, retry exhaustion, and lease recovery using the same schema/runtime revision.
