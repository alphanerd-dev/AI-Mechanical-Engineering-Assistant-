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

The first implementation step is the decision/recovery experience, as the corrected independent review recommends. Operational setup is a parallel prerequisite for live acceptance—not a reason to postpone fixing a user-visible contract problem.

| ID | Milestone | Status | Dependency |
|---|---|---|---|
| M0 | Decision surfaces, failure recovery and outcome instrumentation | **NEXT** | Existing API/result contracts |
| M1 | CAD production confidence | **BLOCKED for current-revision live acceptance** | M0 regression suite; isolated runtime and environment configured |
| M2 | Expand the bounded calculation family under the same evidence contract | **PLANNED** | M0; M1 confidence gate should remain active for any CAD-linked result |
| M3 | Provider-promotion contract and one evidence-backed pilot | **DEFERRED until value is measured** | M0–M2 evidence and a specific user need |

## M0 — Decision surfaces, failure recovery and outcome instrumentation

**Outcome:** every supported API result becomes a truthful, actionable decision in the workspace. The user can understand what happened, what remains unresolved and what to do next, without losing their work.

### Implementation

1. Map every existing result state to an explicit UI decision: PROPOSED, NEEDS_INPUT, UNSUPPORTED, EXECUTED, VALIDATED, VERIFIED, WAITING_APPROVAL and FAILED (plus any additional state actually defined in the API contract). Do not infer success from HTTP 200 alone or from a single boolean whose contract does not mean “verified”.
2. For each state, render the facts already supplied by the API: key values and units, assumptions, validation/evidence status, evidence links, limitations, approval requirement and next action. Do not manufacture absent engineering values or evidence references. Keep unsupported and blocked work visibly distinct from validation failure.
3. Preserve the user's draft and trusted workspace context after transport, authorization, provider, validation or persistence errors. Make retries explicit. A retry must not silently replay a non-idempotent CAD POST or create duplicate jobs, artifacts or evidence.
4. Keep the current deterministic execution and evidence contracts. Do not add another state machine, agent runtime, evidence store or analytics system unless testing exposes a concrete missing capability.
5. Add component/API/Playwright acceptance for the complete result-state matrix, including seeded partial failures, missing inputs, unsupported intents, validation failure, approval required, server/transport timeout, persistence failure and recovery. Assert that the displayed state, next action and evidence status match the API response.
6. Begin outcome instrumentation now. For representative supported tasks, capture time to accepted outcome, measured engineer-active time including review/correction, stage latency, failures/retries/recovery, evidence completeness, repeat usage and available cost components. Mark unobserved effort/cost as unknown; do not claim time or cost savings before a comparable baseline exists.

### Exit gate

Every supported result state is tested at the UI/API boundary; no partial failure is shown as silent success; drafts/context survive recoverable failures; retry behavior cannot duplicate non-idempotent effects; evidence/validation semantics remain unchanged; existing deterministic and CAD tests stay green. Record actual baseline observations and unknowns rather than declaring a productivity improvement.

## M1 — CAD production confidence

**Outcome:** the existing explicitly dimensioned cylindrical CAD path is accepted on the exact current revision in an isolated environment—not merely present in source or green in offline CI.

### Implementation

1. Unblock the current live acceptance environment. The last reviewed [CAD Workspace Live Acceptance run](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634636058) stopped before the authenticated test because CAD_WORKSPACE_BASE_URL was missing. Configure the protected cad-workspace-live-acceptance environment with CAD_WORKSPACE_BASE_URL, CAD_WORKSPACE_PROJECT_ID, CAD_WORKSPACE_MODEL_ID and secret CAD_WORKSPACE_COOKIE; rerun after M0 on the new exact revision. Never print or commit the cookie.
2. Verify the app deployment revision and actual worker/source image revision, health, authentication, artifact directory/storage, runtime flags and resource controls. Check DURABLE_EXECUTION_ENABLED, the worker endpoint and production migration/schema status before enabling any durable path. Reconcile production migration history only through the reviewed migration workflow.
3. Preserve the supported pipeline: explicit typed cylindrical intent → deterministic build123d source generation → isolated worker → artifact registration → independent OCCT BREP validation → evidence receipt bound to exact artifact bytes and trusted project/model/run lineage. Do not turn free-form model-generated code or an arbitrary BREP script into the primary production contract.
4. Add/retain negative-path fixtures for missing dimensions, unsupported intent, malformed request/manifest, worker timeout or non-zero exit, path traversal, unexpected/missing/oversized artifact, digest mismatch, validator disagreement, persistence failure, cleanup failure and cross-project read/write attempts.
5. Verify that the persisted BREP digest matches the validator receipt and that measured geometry and model/project lineage agree on readback. Authorization must protect all model, artifact, completion and evidence reads.
6. Distinguish validated BREP from exports. A receipt for BREP does not independently validate STEP/STL/3MF bytes. Re-import and validate each exact exported representation and issue its own bound receipt before labelling that export independently verified; otherwise label it as an export derived from a validated BREP.
7. Choose stage-specific queue, generation, build, validation and persistence timeouts from measured staging durations and worker cold-start behavior. Do not impose a blanket 60-second end-to-end limit without evidence.

### Parallel release and runtime preconditions

These are enabling controls for safe acceptance and release, not a reason to delay M0's UI/recovery work:

- Protect main, require pull requests and appropriate Core CI/ESLint/CodeQL checks, and prevent force-pushes. Add provider benchmark checks for relevant changes.
- Treat a security scanner marked SKIPPED because a token/configuration is missing as unverified, not as a pass.
- Use only dedicated non-production app/database and disposable accounts for Playwright; ensure E2E_SUPABASE_PROJECT_REF differs from PRODUCTION_SUPABASE_PROJECT_REF, the exact host is allowlisted and the auth origin matches.
- The previous migration reconciliation run skipped apply/repair/write steps. Do not infer migrations were applied from that run; verify history and schema explicitly.
- Keep all changes on reviewed feature branches. Do not enable production flags or deploy merely because source CI passes.

### Exit gate

Same-revision CI passes and the authenticated live CAD workflow completes on the exact revision; it records the deployed app/worker versions; the persisted BREP bytes match the receipt and digest; geometry measurements and project/model lineage match; unauthorized access and failure cases fail closed; the result surface tells the truth about the artifact and any outstanding approval.

## M2 — Expand the bounded calculation family

**Outcome:** extend engineering value with one well-defined calculation family at a time, using the same input, units, validation, evidence and decision contracts as existing calculations.

### Implementation

1. Start with the existing shaft torque/preliminary-sizing path and its known-answer tests. Treat these as calculation results under stated assumptions, not a blanket claim that a shaft design is safe. Torque from power and RPM alone does not determine an acceptable diameter without the relevant load cases, material allowables, safety factor, failure modes and engineering review.
2. Use M0's task observations to choose the next calculation family; do not select work merely because a library or provider exists. Before coding, define its user problem, required inputs, units, assumptions, validity range, known-answer/analytical references, missing-input behavior and required approval.
3. Normalize/validate units and domain limits before execution. Return NEEDS_INPUT where a material input is absent; return UNSUPPORTED when outside declared scope. Do not guess inputs to make a calculation complete.
4. Execute through registered deterministic providers, independently check the result where possible, and persist inputs, assumptions, provider/version, calculations, validation method, failures and evidence lineage.
5. Add boundary/invalid-value fixtures, dimensional-analysis tests, known-answer cases and API/UI/Playwright coverage for success, missing inputs, invalid units, domain-limit failure and recovery.

### Exit gate

The selected calculation family has an explicit scope/assumption contract, independent known-answer evidence, correct unit and boundary behavior, truthful result state, and traceable persisted evidence. It is selected based on a documented user need, and any benefit claim is supported by M0 measurements.

## M3 — Provider promotion contract and one evidence-backed pilot

**Outcome:** promote at most one strategically useful provider based on repeatable evidence, not documentation presence, marketing claims or process exit code.

### Implementation

1. Record the capability/provider ID and version, exact source/image digest, licence and dependency obligations, required configuration, unit/input/output schema, timeout/resource budgets, expected artifacts, validation/evidence contract, known limitations and rollback procedure.
2. Screen the selected candidate's current source release, maintenance, licensing, dependency/security posture and worker isolation. Do not copy code, datasets or models until the applicable terms and use rights are confirmed.
3. Use the same declared benchmark fixtures, known-answer/analytic reference where applicable, independent validator, negative cases and evidence schema as the existing capability. Record all failed and excluded trials, not only successful runs.
4. Run one pilot only, selected by user demand and M0–M2 results. It may be an alternative CAD provider or a bounded open FEA path such as CalculiX/Gmsh, but do not start both in parallel. A provider's presence in the repository does not imply its runtime is deployed or production-ready.
5. Keep providers EXPERIMENTAL/PILOT until exact-revision tests, isolated runtime controls, independent validation and retained evidence pass with review approval. Do not adopt LangGraph/LangChain, LiteLLM, Vercel AI SDK, pg-boss or another orchestration/queue stack unless a measured gap in accepted outcomes justifies the added complexity.

### Exit gate

One candidate has a reviewable licence/security record, pinned runtime, reproducible fixture results, independent validation, clear limits, operational observability and rollback. Promotion is scoped to the capability and exact runtime/version tested; it does not certify other providers or domains.

## Deferred scope

Broad freeform/assembly CAD, general-purpose topological repair, production-grade FEA/CFD safety claims, manufacturing/CAM output, robotics, ECAD, PLM rollout and physical-perception workflows remain deferred until a specific user need and a separate capability-level acceptance contract justify them. For FEA, a pilot must declare geometry, material, loads, supports, contacts where relevant, mesh controls, solver diagnostics, convergence, analytical/known-answer comparison and independent engineering review. A completed solve or stress below yield alone is not a design-safety verdict.

## Non-negotiable engineering gates

- Keep the current stack and provider-neutral seams; do not add LangGraph/LangChain, LiteLLM, Vercel AI SDK or another runtime unless actual runtime wiring and a measured requirement justify it.
- Worker policy is defined in [docs/worker-security.md](worker-security.md): allowlisted capabilities, isolated non-root execution, no network by default where possible, read-only root, scoped artifacts, resource limits, schema validation and run provenance. Verify deployed controls; a policy document is not proof of enforcement.
- Hashes and hash chains provide integrity evidence only within their threat model. Do not describe a record as digitally signed or immutable without protected signing keys and a verification anchor.
- A CI pass proves only what that run tests. A live provider smoke test proves its stated connectivity/contract, not broad engineering correctness or structural safety.
- Evidence must identify source revision, provider/runtime version, inputs/units, validation method, exact artifact digest, measured outcome, assumptions, failures, reviewer/approval and applicable limitations.
- Every milestone closes with code/tests where applicable, retained evidence, current docs, explicit scope limits and a rollback path. A milestone is complete only when its exit gate has evidence on the exact revision.