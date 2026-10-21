# Implementation Plan and Milestones

**Updated:** 22 October 2026  
**Status:** Active execution plan. This document replaces the old release-by-release roadmap as the source of truth for upcoming work. Completed capabilities are established by source, tests, migrations and retained workflow evidence—not by milestone notes alone.

## Product and engineering rule

**AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**

Optimize for the first useful, accepted engineering outcome—not the number of providers, agent frameworks, dashboards or domain labels. Keep the existing Next.js/TypeScript control plane, Supabase project/workspace and durable-job foundations, bounded workers, provider contracts and independent validators. Add complexity only when an acceptance test demonstrates a gap.

## Verified baseline and blockers

Baseline checked against main commit [5da2823](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/5da2823ff7792cb23e9ae36b193cd627f2d4d7ba) on 22 October 2026.

| Area | Current evidence | Consequence |
|---|---|---|
| Repository CI | [Core CI run](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39644040159), ESLint, CodeQL and Codacy passed for the reviewed main revision. | Good source-level baseline; it does not prove live provider connectivity or production engineering correctness. |
| Live CAD acceptance | [Run 39634636058](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634636058) stopped at environment preflight because CAD_WORKSPACE_BASE_URL was missing. The authenticated test did not execute. | Treat as BLOCKED by configuration, not as evidence that CAD itself failed or passed. |
| Deployed app and worker | The Vercel app deployment was reported READY for this revision. render.yaml and worker workflows exist, but an authenticated current-revision app-to-worker result is still required. | Confirm the exact deployed revisions, worker health, authentication and runtime configuration in non-production. |
| Durable execution | The Supabase job store, migrations and lease/idempotency code exist. The recorded E2E database checks cover important lease and cancellation constraints. | Do not assume the production API-to-worker route is live. Re-check the production migration ledger and feature flag before rollout. The [reconciliation run](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634898622) skipped apply/repair/write actions; a successful reconciliation run is not proof that migrations were applied. |
| Main branch controls | Main branch protection and required status checks were disabled at review time. Dependabot security updates were also disabled. | Close repository release-control gaps before production feature changes. |

These are a dated evidence snapshot, not permanent guarantees. Recheck the exact SHA, deployment and workflow evidence before promoting a release.

## Milestone overview

| ID | Milestone | Status | Dependency |
|---|---|---|---|
| M0 | Release controls and isolated acceptance environment | BLOCKED / first | None |
| M1 | One accepted shaft-to-CAD engineering outcome | NOT VERIFIED on current deployed revision | M0 |
| M2 | Prove the existing durable execution path end to end | NOT VERIFIED in production | M0; build on M1's accepted workflow |
| M3 | Measure usability and cost per accepted outcome | NOT STARTED | M1; preferably M2 for representative operational measurements |
| M4 | Add one geometry family at a time | DEFERRED | M1–M3 exit gates |
| M5 | Broader FEA and additional engineering domains | DEFERRED | A specific user need, provider acceptance and separate validation plan |

## M0 — Release controls and isolated acceptance environment

**Outcome:** every claim about the current product can be tied to a source revision and the right test evidence, without putting production data at risk.

Tasks:

1. Protect main: require pull requests, prevent force-pushes, and configure required status checks for Core CI, ESLint and CodeQL. Add provider benchmark checks when the workflow applies to the changed area. Treat security tooling marked SKIPPED (for example, because its project token is absent) as unverified, not as a pass.
2. Check the Vercel deployment SHA and the actual CAD worker deployment/image revision. Verify worker health, authentication, artifact path, resource limits and the exact runtime variables used by the app. Do not enable a feature flag merely because a deployment says READY.
3. Configure the GitHub Environment cad-workspace-live-acceptance with CAD_WORKSPACE_BASE_URL, CAD_WORKSPACE_PROJECT_ID, CAD_WORKSPACE_MODEL_ID and secret CAD_WORKSPACE_COOKIE. Do not print or commit secret values. The preflight should fail clearly when a required value is absent.
4. Configure e2e-staging only for a dedicated non-production app/database and disposable accounts. Confirm E2E_BASE_URL is on the exact host allowlist, matches E2E_CANONICAL_BASE_URL, and uses an E2E_SUPABASE_PROJECT_REF different from PRODUCTION_SUPABASE_PROJECT_REF. Do not reinstate a shared/production database override.
5. Re-check production migration history and schema for 20261017104855_v2_0_29_durable_execution_jobs and 20261017105801_v2_0_30_database_clock_execution_leases. Follow the reviewed [production migration reconciliation procedure](architecture/2026-10-17-production-migration-ledger-reconciliation.md); inspect its before/after evidence and explicit gate. Do not repair migration history or apply production migrations ad hoc.
6. Keep changes isolated on feature branches; document exact commit SHAs, workflow URLs and what each result actually proves.

**Exit gate:** required CI checks pass on one PR revision; the dedicated E2E environment has passed its preflight; live CAD acceptance runs against that same revision and successfully authenticates, executes, persists and reads back an artifact; the app/worker SHA and configuration are recorded; production migration status is known without unauthorized writes.

## M1 — One accepted shaft-to-CAD outcome

**Outcome:** an engineer can start with supported, explicit inputs and receive a traceable engineering result or a useful blocker—not a plausible-looking, unverified artifact.

Implement and verify this single path before broadening geometry:

1. Gather and reuse trusted project context. Validate units, required dimensions and material/load assumptions. If an input material to the calculation is missing, return NEEDS_INPUT before execution; do not guess it.
2. Route the request to an existing registered deterministic capability. Keep shaft torque/preliminary sizing explicitly preliminary. For example, torque from power and rotational speed does not establish a safe shaft diameter without the governing loads, material allowables, safety factor, failure modes and appropriate review.
3. Keep the initial CAD scope bounded to geometry the current provider contract actually supports. Reject unsupported geometry before worker execution. Do not run arbitrary model-written source as a capability.
4. Build in the isolated worker, validate the BREP independently with OCCT, and bind the validator receipt to the exact BREP bytes, measured geometry, project/model/run lineage and persisted artifact digest.
5. Persist artifacts privately and authorize every read. Display result state, key values and units, assumptions, validator outcome, evidence links, limitations, approval requirement and the next action.
6. Add negative-path tests for missing inputs, unsupported intent, worker timeout/non-zero exit, malformed manifest, path traversal, unexpected or oversized output, digest mismatch, validator disagreement, persistence/cleanup failure and cross-project access.
7. Make exports' status precise. A receipt for a validated BREP does not independently validate derived STEP/STL/3MF bytes. Re-import and validate the exact export and bind a separate receipt before calling that export verified; otherwise label it as a representation derived from the validated BREP.
8. Set per-stage timeouts for queue wait, model proposal, CAD build, validation and persistence from staging measurements. Do not apply a blanket 60-second timeout that ignores worker cold starts and previously measured stage durations.

**Exit gate:** the same-revision authenticated live acceptance is green; nominal and failure fixtures behave as specified; stored BREP bytes hash-match the receipt; independent measured geometry and project/model lineage match; unsupported/missing inputs fail closed; results never claim structural safety merely because CAD geometry passed.

## M2 — Prove the existing durable execution path end to end

**Outcome:** long-running operations can recover and finish without duplicate side effects or stale workers overwriting accepted results.

1. Exercise the existing src/execution/supabase-job-store.ts, job migrations and lease RPCs before proposing a replacement queue. Do not introduce pg-boss unless measured tests show a required guarantee that the current implementation cannot provide.
2. Confirm the deployed value of DURABLE_EXECUTION_ENABLED and the actual persistent worker URL, image/source revision, health check and service authentication. Keep the feature off by default until all rollout gates pass.
3. Test authenticated submission → claim → lease renewal/heartbeat → result commit → status read. Also test idempotency replay and conflict, retry exhaustion, cancellation before and during execution, worker outage/restart, expired lease recovery and stale fencing-token rejection.
4. Prove that retries and repeated client requests do not create duplicate accepted artifacts, completion evidence or audit events. Make side effects idempotent; do not promise universal exactly-once execution.
5. Record queue wait, worker start-up, each execution stage, validation and persistence durations. Set budgets from observed distributions and explicit capability limits.
6. Apply production schema changes only through the reviewed migration workflow after reconciling the exact migration history. Roll out the feature flag to a controlled test cohort first, then expand only after verification.

**Exit gate:** an authenticated live end-to-end job passes; crash/restart and lease-expiry tests recover safely; stale workers cannot commit; replay is idempotent; cancellation/retry behavior is explicit; the production schema and flag are verified; rollback to the prior path is documented and exercised.

## M3 — Measure product usefulness and outcome economics

**Outcome:** prioritize work using observed engineering effort and quality, not feature count or unverified savings claims.

1. Use [docs/outcome-baseline.md](outcome-baseline.md) to record a small baseline of representative tasks. Capture time to accepted outcome, active engineer time including review/correction, evidence completeness, failure/recovery rate, repeat use and known cost components.
2. Start with a directional pilot (for example, 3–5 intended users over 5–10 task trials). Record the actual sample and limitations; do not present a small pilot as statistically conclusive.
3. Make the workspace experience help users start, retain their draft after failure, understand assumptions and distinguish EXECUTED, VALIDATED, VERIFIED, BLOCKED and approval-required states. Do not ask again for known trusted context or convert an absent field into a fabricated fact.
4. Mark unknown cost/effort components as unknown. Compare equivalent task classes and include correction/review time; do not claim reduced cost or increased productivity without a comparable baseline.

**Exit gate:** a repeatable baseline and task log are stored; users can complete the supported journey or identify a clear blocker; product decisions point to the observed data, and any adoption/savings claim is bounded by that evidence.

## M4 — Add one geometry family at a time

**Outcome:** expand only after the first complete path is useful and reliable.

The next candidate may be a plate with holes or a bracket, but it is not part of the current verified CAD scope. Before implementation, define a typed parametric specification, units and tolerances, valid/invalid/boundary cases, independent analytic or known-answer checks, expected BREP measures, exact export validation and a provider-neutral fixture contract. Add the geometry family behind an explicit supported-capability route.

Use the same fixture contract and security review for any alternative provider. Evaluate one candidate at a time; screen exact source/release, license and dependency obligations, runtime isolation, reproducibility and evidence. Do not set an arbitrary universal 95% success threshold or a 20-shape target without a representative baseline and predeclared acceptance criteria.

**Exit gate:** fixtures cover nominal, boundary and invalid inputs; validators reject corrupted or mismatched artifacts; independent checks support the claimed result; current CI and live acceptance are green; limitations and failure cases are visible; no provider is promoted based only on a model score or successful process exit.

## M5 — FEA and other domains (deferred)

Do not claim a design is safe because one FEA run completed or a reported stress is below yield. A bounded FEA pilot needs explicit geometry, material properties, loads, supports, contacts where applicable, mesh controls, solver diagnostics, convergence evidence, a known-answer/analytical reference and independent engineering review. Report results only under the stated assumptions and limits.

Defer new robotics, CAM, ECAD, CFD, perception and autonomous multi-step capabilities until a user need justifies a capability-specific acceptance plan, isolated runtime, validator, evidence contract and owner. The repository may contain interfaces or prototypes; their existence is not production readiness.

## Non-negotiable engineering gates

- Keep the current stack and provider-neutral seams; do not add LangGraph/LangChain, LiteLLM, Vercel AI SDK or another runtime unless actual runtime wiring and a measured requirement justify it.
- Worker policy is defined in [docs/worker-security.md](worker-security.md): allowlisted capabilities, isolated non-root execution, no network by default where possible, read-only root, scoped artifacts, resource limits, schema validation and run provenance. Verify deployed controls; a policy document is not proof of enforcement.
- Hashes and hash chains provide integrity evidence only within their threat model. Do not describe a record as digitally signed or immutable without protected signing keys and a verification anchor.
- A CI pass proves only what that run tests. A live provider smoke test proves its stated connectivity/contract, not broad engineering correctness or structural safety.
- Evidence must identify source revision, provider/runtime version, inputs/units, validation method, exact artifact digest, measured outcome, assumptions, failures, reviewer/approval and applicable limitations.
- Every milestone closes with code/tests where applicable, retained evidence, current docs, explicit scope limits and a rollback path. A milestone is complete only when its exit gate has evidence on the exact revision.