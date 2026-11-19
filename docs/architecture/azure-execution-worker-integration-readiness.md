# Azure execution-worker integration readiness

**Audit date:** 19 November 2026  
**Repository baseline:** `c32c03daa053d611d5d0b761c8e6bb206ab269a0`  
**Status:** worker image promoted; production app-to-worker queue processing is not yet activated or production-accepted.

## Runtime path verified from source

1. `POST /api/execution` selects the durable handler only when `DURABLE_EXECUTION_ENABLED=true`. Otherwise it deliberately uses the legacy synchronous path.
2. The durable handler validates the request, requires an idempotency key, authorizes `TASK.EXECUTE` against the project, and additionally authorizes `EVIDENCE.WRITE` for FEA/CFD jobs.
3. The server uses the Supabase service-role client to persist the job in `engineering_execution_jobs`. The client/browser does not write queue rows directly.
4. `GET /api/execution/:jobId` and `DELETE /api/execution/:jobId` are also gated by the durable-execution flag and re-authorize the project.
5. The Azure worker uses a server-only service-role client to claim jobs through the database RPC, renew a database-clock lease, execute through the allowlisted adapters, and commit only while holding the matching fencing token.

The isolated Azure queue acceptance has already proved the narrow deterministic shaft-torque path: authenticated enqueue, idempotent replay, one Azure worker drain, persisted result/provenance, lease release and authenticated status readback. That result does not prove production queue processing or every backend.

## Defect corrected by V2.0.34

The durable API parser accepts four backends: `typescript-safe`, `python-worker`, `fea-worker`, and `cfd-worker`. The original V2.0.29 table constraint admitted only `typescript-safe` and `python-worker`. Consequently, a valid FEA/CFD request could pass application validation and authorization but fail at database insertion.

V2.0.34 replaces only that backend check constraint with the same four-backend allowlist as the API. It preserves existing rows and does not enable durable execution. A migration-contract test guards the API/schema allowlist agreement.

## Remaining integration limits

- Production `DURABLE_EXECUTION_ENABLED=false`; production API requests continue using the legacy path. No production queue item has been submitted or processed as part of this audit.
- The production Azure Container Apps Job is Manual. A job run is a bounded drain, not a persistent worker service. No schedule is configured.
- The worker image's CalculiX and OpenFOAM adapters require their respective authenticated worker URL/token pairs. This branch adds protected GitHub Environment variable/secret wiring for both pairs into the Azure job, with HTTPS and paired-presence checks; the job stores tokens as Container Apps secrets and passes only secret references to the worker process.
- A metadata-only Vercel Production environment audit found `DURABLE_EXECUTION_ENABLED=false` and no production variables for `CALCULIX_WORKER_URL`, `CALCULIX_WORKER_API_TOKEN`, `OPENFOAM_WORKER_URL`, `OPENFOAM_WORKER_API_TOKEN`, `PYTHON_WORKER_URL`, or `PYTHON_WORKER_API_TOKEN`. The endpoint pairs are therefore not configured on the production API. Do not enable durable execution or advertise FEA/CFD queue execution until the corresponding solver endpoints exist and both API and Azure worker configurations are populated and verified.
- The production image promotion is verified by immutable digest. It is not a production queue-to-result acceptance test.
- The isolated acceptance does not yet cover production retry behavior, expired-lease recovery, cancellation races under load, or cross-project isolation at the deployed production boundary.

## Release sequence

1. V2.0.34 and its migration contract test are merged to `main`; apply it only to the dedicated E2E database first and verify its migration ledger before solver-backend acceptance.
2. Merge the Azure workflow wiring after exact-head CI passes. Populate the protected GitHub Environment with `CALCULIX_WORKER_URL` / `OPENFOAM_WORKER_URL` and matching secrets only after the endpoint services are actually deployed and authenticated.
3. Configure the same backend URL/token pairs in Vercel Production as server-only variables/secrets. Verify variable presence without reading secret values; the current production audit found none of these pairs.
4. Keep the Azure job Manual and run a controlled acceptance only against a dedicated isolated test project/database first.
5. Before any production queue test, prepare a single known-answer, non-destructive job with a unique test project, explicit cleanup plan, exact resource/job scope, and observable result/evidence checks. Obtain explicit authorization for that production test before starting the worker.
6. Keep `DURABLE_EXECUTION_ENABLED=false` until production app enqueue, worker claim/execute, result persistence, authenticated readback, idempotent replay, cancellation and cleanup are demonstrated. Do not enable a schedule without a separate explicit release decision.

## Safety boundary

No production queue job was started, no schedule was created, no production feature flag was changed, and no secret value was read into this report. Azure spend/budget status remains unverified. A successful build or a ready Vercel deployment is not evidence that production queue processing is active.
