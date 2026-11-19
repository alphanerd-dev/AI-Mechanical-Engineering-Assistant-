# Azure execution-worker integration readiness

**Audit date:** 19 November 2026  
**Repository baseline:** `c32c03daa053d611d5d0b761c8e6bb206ab269a0`  
**Status:** one bounded production TypeScript-safe app-to-Azure-worker canary passed on 19 November 2026; the project-scoped canary gate has since been disabled. Global durable execution remains disabled and the Azure job remains Manual with no schedule.

## Runtime path verified from source

1. `POST /api/execution` selects the durable handler only when `DURABLE_EXECUTION_ENABLED=true`. Otherwise it deliberately uses the legacy synchronous path.
2. The durable handler validates the request, requires an idempotency key, authorizes `TASK.EXECUTE` against the project, and additionally authorizes `EVIDENCE.WRITE` for FEA/CFD jobs.
3. The server uses the Supabase service-role client to persist the job in `engineering_execution_jobs`. The client/browser does not write queue rows directly.
4. `GET /api/execution/:jobId` and `DELETE /api/execution/:jobId` are also gated by the durable-execution flag and re-authorize the project.
5. The Azure worker uses a server-only service-role client to claim jobs through the database RPC, renew a database-clock lease, execute through the allowlisted adapters, and commit only while holding the matching fencing token.

The isolated Azure queue acceptance and the production canary both proved the narrow deterministic shaft-torque path: authenticated enqueue, one Azure worker drain, persisted result/provenance, lease release, authenticated status readback and idempotent replay. The production canary proves only the `typescript-safe` path for one bounded job; it does not establish production readiness for every backend or workload.

## Defect corrected by V2.0.34

The durable API parser accepts four backends: `typescript-safe`, `python-worker`, `fea-worker`, and `cfd-worker`. The original V2.0.29 table constraint admitted only `typescript-safe` and `python-worker`. Consequently, a valid FEA/CFD request could pass application validation and authorization but fail at database insertion.

V2.0.34 replaces only that backend check constraint with the same four-backend allowlist as the API. It preserves existing rows and does not enable durable execution. A migration-contract test guards the API/schema allowlist agreement.

## Production canary acceptance — 19 November 2026

A single authenticated production application-to-Azure-worker acceptance was completed after explicit authorization.

- The production app created a dedicated canary project. `DURABLE_EXECUTION_CANARY_PROJECT_ID` was temporarily set to that exact project; `DURABLE_EXECUTION_ENABLED=false` remained unchanged.
- The authenticated `POST /api/execution` returned HTTP 202 and persisted one `QUEUED` `ANALYSIS.SHAFT_TORQUE` job on the `typescript-safe` backend. Inputs were 5 kW and 1,500 rpm.
- The production Azure Container Apps Job used the accepted immutable image `sha256:2bcc4f1c3724728596db120c7492f1f55c53c2ee6bc5b806a2d7ce2e5ba31f9d`, Manual trigger, no schedule, 900-second replica timeout, 780,000 ms worker runtime budget and a configured five-job drain ceiling. Only one queue item existed for the canary and one manual drain was started.
- GitHub Actions [workflow run #44601360200](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/44601360200) completed successfully. The worker execution completed successfully and the job reached `SUCCEEDED` with one attempt.
- Persisted result: `T = 9550 P(kW) / n(rpm)`; torque = 31.833333333 N·m. The result included request/input/output digests and provider provenance. No artifact or evidence IDs were emitted; this is execution evidence, not formal engineering validation or human approval.
- Authenticated `GET /api/execution/{jobId}` returned HTTP 200. Repeating the identical request with the same idempotency key returned HTTP 200 with `idempotentReplay=true` and the same job ID; no duplicate job was created. The database showed the lease owner, token and expiry cleared after success.
- After acceptance, the canary project UUID environment variable was blanked and the unchanged `main` commit was redeployed to Production. The rollback deployment reached `READY`. A subsequent authenticated status GET returned HTTP 404 with `DURABLE_EXECUTION_DISABLED`. The global durable flag remains `false`, and the queue has no queued or running jobs.
- The Azure job remains Manual and unscheduled. No FEA, CFD or Python job was submitted.

This is a successful one-job production queue-to-worker acceptance, not a global durable-execution release.

## Remaining integration limits

- Production `DURABLE_EXECUTION_ENABLED=false`; production API requests continue using the legacy path. No production queue item has been submitted or processed as part of this audit.
- The production Azure Container Apps Job is Manual. A job run is a bounded drain, not a persistent worker service. The configured drain ceiling is five jobs per run; the acceptance queue contained exactly one item. No schedule is configured.
- The worker image's CalculiX and OpenFOAM adapters require their respective authenticated worker URL/token pairs. The OpenFOAM request contract permits a 600-second solver timeout; the API adds 120 seconds and the HTTP adapter polls for up to 750 seconds. The Azure deployment now gives the worker a 780-second drain budget and a 900-second Container Apps replica timeout, avoiding the previous 210-second worker/240-second Azure cutoff. The worker still processes at most one job per manual drain. This branch adds protected GitHub Environment variable/secret wiring for both pairs into the Azure job, with HTTPS and paired-presence checks; the job stores tokens as Container Apps secrets and passes only secret references to the worker process.
- A metadata-only Vercel Production environment audit found `DURABLE_EXECUTION_ENABLED=false` and no production variables for `CALCULIX_WORKER_URL`, `CALCULIX_WORKER_API_TOKEN`, `OPENFOAM_WORKER_URL`, `OPENFOAM_WORKER_API_TOKEN`, `PYTHON_WORKER_URL`, or `PYTHON_WORKER_API_TOKEN`. The endpoint pairs are therefore not configured on the production API. Do not enable durable execution or advertise FEA/CFD queue execution until the corresponding solver endpoints exist and both API and Azure worker configurations are populated and verified.
- The production image promotion is verified by immutable digest. The post-acceptance rollback deployment for main commit `14b08d0958cf44494f205d96db9d3a0a3a5f4f5c` is `READY`; a production runtime-log query after the canary found no error/fatal records. The queue-to-result acceptance is proven for one TypeScript-safe job only.
- The one-job production canary does not cover retry behavior, expired-lease recovery, cancellation races under load, FEA/CFD/Python worker integrations, or cross-project isolation under concurrent production load.

## Release sequence

1. V2.0.34 and its migration contract test are merged to `main`. The migration is present in both the dedicated E2E and production migration ledgers. E2E records version `20261119171913`; production records `20261119190000`. Direct `pg_constraint` reads on both databases confirm the exact four-backend allowlist. No production queue job was submitted or processed.
2. Merge the Azure workflow wiring after exact-head CI passes. Populate the protected GitHub Environment with `CALCULIX_WORKER_URL` / `OPENFOAM_WORKER_URL` and matching secrets only after the endpoint services are actually deployed and authenticated.
3. Configure the same backend URL/token pairs in Vercel Production as server-only variables/secrets. Verify variable presence without reading secret values; the current production audit found none of these pairs.
4. Keep the Azure job Manual and unscheduled. The first production canary has passed for one TypeScript-safe job; any additional backend or concurrency acceptance must use a dedicated isolated project/database unless separately authorized.
5. For any future production queue test, prepare a single known-answer, non-destructive job with a unique test project, explicit cleanup plan, exact resource/job scope, and observable result/evidence checks. Obtain explicit authorization before starting the worker.
6. Keep `DURABLE_EXECUTION_ENABLED=false` until broader production acceptance covers retry/recovery, cancellation, cleanup, approval/evidence boundaries, monitoring and cross-project isolation. Do not enable a schedule without a separate explicit release decision.

## Safety boundary

One explicitly authorized production queue job was started and completed. No schedule was created; global durable execution remained false; the temporary project-scoped canary was disabled after acceptance. No secret value was read into this report. Azure spend/budget status remains unverified. A successful build or a ready Vercel deployment alone is not evidence of queue processing; the acceptance above is the separate runtime evidence.
