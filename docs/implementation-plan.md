# Implementation Plan and Milestones

**Updated:** 29 October 2026  
**Status:** Active plan; implementation and live readiness claims require evidence on the exact revision.

This is the single source of truth for upcoming work, priorities, dependencies and exit gates. See the [Product Brief](product-brief.md) for the agreed experience and [Engineering Capabilities](engineering-capabilities.md) for the distinction between existing provider contracts and supported live capabilities.

## Product and engineering rule

**AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**

Keep the existing Next.js/React/TypeScript control plane, Supabase project/workspace and authorization, provider-neutral Engineering Core, capability routing, deterministic execution, isolated workers, independent validators and artifact/evidence contracts. Add libraries and abstractions only where they close an evidenced gap.

The current product decision is to implement assistant-ui + Vercel AI SDK for a streamed conversational experience over a configurable OpenAI-compatible hosted model endpoint. The model vendor/model is not yet selected; lowest practical API cost is the priority subject to measured capability and reliability. Three.js, VTK.js and a typed SVG/canvas diagram renderer are proposed for later visualization milestones, not currently installed viewer features.

## 1. Current baseline, known gaps and blockers

The source-of-truth baseline reviewed for this plan is [main commit 3579fcdc64c20745e5490177d31e1eb1d67e6e9b](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/3579fcdc64c20745e5490177d31e1eb1d67e6e9b). The implementation continuation and phase checklist are documented in [docs/plans/2026-10-29-forge-phased-implementation.md](plans/2026-10-29-forge-phased-implementation.md).

### Current baseline evidence

| Area | Verified state | Consequence |
|---|---|---|
| Source/build stack | Next.js App Router, React, TypeScript; package scripts provide npm test, npm run build and npm run test:e2e. | Preserve the existing repo and pinned dependency choices; do not regenerate another app. |
| Auth and persistence | Supabase SSR/client integration, auth routes, protected project APIs, workspace state and 16 SQL migrations are present. Main-SHA check runs and the isolated authenticated Playwright suite passed. | Re-test the exact feature revision; recent public browser inspection did not submit credentials, so it does not prove a successful interactive sign-in. |
| M0 decision/persistence | Pump-power deterministic pilot, explicit result states, revision-bound evidence, idempotency and server-only workspace mutations are merged on main. | Keep as implemented/pilot. It is not engineering approval or broad capability coverage. |
| CAD acceptance | Isolated authenticated E2E run [40774982422](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/40774982422) passed 12/12, including accepted cylindrical CAD, artifact readback, OCCT receipt/digest and audit-chain correlation, plus cleanup. | Reuse this test; do not infer arbitrary CAD support from the bounded cylinder pilot. |
| Live public UI | Browser Use rendered / and /login; BrowserAct checked the public landing/login pages and found 7/7 links working. | Good public route baseline only. Production credentials were not entered and no production data was mutated. |
| Auth responsive layout | The PR branch scopes a vertical `authForm` layout to login/signup. Public-only Playwright run [40826543823](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/40826543823) passed 3/3 tests (sign-in, sign-up, public workspace keyboard/mobile navigation), with sanitized evidence [artifact 12877091461](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/40826543823/artifacts/12877091461). | The targeted form-layout defect is fixed and regression-tested on SHA `990516c39dbe9c9559a1091e495b784c61e695cc`. Full authenticated workspace journeys are distinct from this public-only run. |
| Design source | Forge v11.2 ZIP and audited HTML SHA-256 match docs/design/forge-v11.2/README.md; supplied captures include 21 desktop and 9 mobile screens. | Visual reference confirmed. The prototype and screenshot capture are not production backend or capability evidence. |
| Streaming AI | No assistant-ui or Vercel AI SDK package and no dedicated assistant streaming route at the baseline. Current structured reasoning/intent transport exists. | M1 is still planned; preserve existing adapter semantics and test parity before adding the stream. |
| Viewers | No complete connected Three.js CAD viewer, VTK.js FEA viewer or structured persistent P&ID/PFD editor is evidenced by the reviewed source. | These remain planned integrations; label fixtures and unavailable capabilities honestly. |
| Outcome baseline | Fixture-based tests cover the summary helper; the measurement protocol is now documented in [outcome-baseline-collection.md](outcome-baseline-collection.md). | A real, representative measured baseline is still missing; do not claim measured time or cost savings. |

### Remaining M0 blockers

1. **Broader authenticated UI acceptance:** the new public-only sign-in/sign-up and workspace tests passed on the PR SHA, but no credentials were submitted in those tests. Run the full authenticated project/persistence/ownership journey against the exact revision where the configured redirect origin, Vercel protection bypass and isolated E2E Supabase environment can be preserved. The earlier 12/12 authenticated suite passed on main, not on this PR SHA.
2. **Full viewport/reflow acceptance:** the responsive auth regression is now passing at the 390×844 Playwright reference viewport. Repeat broader project workspace checks on desktop and mobile; the earlier hosted-agent run had a shorter actual visual viewport than its configured screen height, so full-height browser-chrome behavior remains inconclusive.
3. **Measured outcome baseline:** follow [the collection protocol](outcome-baseline-collection.md) to collect matched, representative non-production trial data for accepted-outcome time, engineer-active review/correction time, retries/recovery, evidence completeness and available cost components. The existing fixture-based calculation test is not that measurement.
4. **Truthful release record:** after full authenticated acceptance and a measured/explicitly unknown outcome baseline, update the milestone decision with evidence for the exact release candidate. Keep production secrets and test data isolated; route rendering, CI and provider readiness are not general engineering verification.

## Milestone overview

| ID | Milestone | Priority/status | Depends on |
|---|---|---|---|
| M0 | Trustworthy decisions, failure recovery, outcome baseline and live CAD acceptance | **Implementation mostly merged; final UI/keyboard acceptance and measured outcome baseline remain open** | Existing API/result contracts |
| M1 | Secure streamed AI conversation and controlled engineering tools | **PLANNED** | Existing auth, session persistence and model transport |
| M2 | Shared artifact/viewer registry and interactive CAD visualization | **PLANNED** | Artifact/access contract; bounded live CAD acceptance remains a regression gate |
| M3 | FEA mesh and result-field visualization | **PLANNED** | M2 artifact/viewer contract and supported solver-output path |
| M4 | Typed P&ID/PFD model and viewer | **PLANNED** | Shared artifact/version/access contract |
| M5 | Additional artifact viewers and one evidence-backed provider pilot | **DEFERRED until need and value are measured** | M0–M4 evidence and a specific user need |

## Phase A — Inspect and plan

**Status: COMPLETE.** The canonical phase, architecture decision, repo map, maturity baseline and remaining acceptance gaps are in [docs/plans/2026-10-29-forge-phased-implementation.md](plans/2026-10-29-forge-phased-implementation.md). Its authority and backend-preservation decision is recorded in [ADR-0014](architecture/adr-0014-product-brief-precedence-and-repository-preservation.md).

## M0 — Trustworthy decision surfaces, recovery and outcome measurement

**Outcome:** every currently supported workflow gives a truthful, recoverable engineering decision, and its current-revision runtime status can be verified without confusing an unavailable environment with a failed algorithm.

### Work

1. Keep proposal, missing-input, unsupported, executing/executed, validation, verification, approval, blocked, stale and failure states separate in source-backed UI/API responses.
2. Render values and units, assumptions, validation/evidence status, provenance, revision, blockers and next action only when supplied by trusted service responses.
3. Preserve drafts and trusted project context after transport, authorization, provider, validation or persistence failures; do not blindly replay a mutating operation.
4. Maintain negative-path tests for missing inputs, unsupported intent, validation failure, approval, timeout, persistence failure, authorization denial and safe retry.
5. Complete responsive login/sign-up correction and add keyboard/focus regression coverage at the supplied 390px reference.
6. Establish a real observed baseline for accepted-outcome time, engineer-active review/correction, stage latency, retries/recovery, evidence completeness and available cost. Mark absent measurements unknown.
7. Verify exact deployed app/worker revisions, trusted runtime readiness, private storage, digests, required migrations and feature flags before enabling a path.
8. Preserve CAD acceptance: typed cylindrical intent → deterministic build123d source → isolated worker → artifact registration → independent OCCT BREP validation → receipt bound to exact bytes and trusted project/model/run lineage.
9. Update status and evidence links for the exact commit; keep unmeasured values and untested release behavior explicitly unknown.

### Exit gate

The result-state matrix and important negative paths are tested; failures do not appear as silent success; saved work survives recoverable failures; retries cannot duplicate non-idempotent effects; accepted CAD passes on the exact release revision in non-production; retrieved private BREP bytes match the stored digest and validation receipt; desktop/mobile/keyboard auth and workspace acceptance pass; and a real outcome baseline is collected or explicitly reported as not yet measured. If a required runtime configuration is missing, report the specific capability as BLOCKED rather than passing the gate.

### Additional M0 vertical slice — pump power calculation

The main branch implements a project-scoped deterministic pump hydraulic/shaft-power operation, capability-specific validation and a digest-bound calculation artifact persisted in the revision-guarded workspace snapshot. Unit/input validation, independent equation checks, tampered-output rejection and artifact digest binding are covered by Vitest; the isolated Playwright journey exercises persistence, revision lineage and result-state separation. This is an additive bounded PILOT—not a substitute for the original doctrine or for remaining M0 gates.

## M1 — Conversational AI, streaming and controlled engineering tools

**Outcome:** users can converse with the assistant directly in the Engineering Workspace and request allowed operations without bypassing existing engineering controls.

### Work

1. Check current official compatibility guidance and install compatible pinned versions of assistant-ui and Vercel AI SDK. Add only the packages required for chat and streaming; do not add an agent framework or gateway as a substitute for the existing core.
2. Implement a dedicated authenticated Next.js chat route that streams responses from a configurable OpenAI-compatible endpoint. Credentials, endpoint allowlist and model configuration remain server-side. Do not accept arbitrary base URLs or API keys from the request body.
3. Reconcile the existing structured reasoning transport configuration and intent-interpreter configuration behind a tested server-side configuration/adapter. Preserve current intent interpretation and structured proposal behavior until the new shared configuration has parity tests; avoid silently changing response semantics.
4. Reuse the existing project-scoped conversation persistence and revision/conflict handling where suitable. Do not create a parallel chat-history store without a demonstrated schema or retention gap.
5. Add typed, schema-validated tool definitions that call only explicitly allowlisted engineering capabilities. The model may request operations; server-side authorization and capability/risk policy determine whether they are allowed.
6. Require explicit missing-input decisions, correct project scope, idempotency for mutating tools, independent validation and required human approval. Do not expose arbitrary source-code execution, shell, unrestricted filesystem or unrestricted database tools to the model.
7. Benchmark candidate hosted models on representative conversational tasks, input extraction, missing-input behavior, valid tool calls, structured results, failure handling, latency and current API price. Choose the lowest-cost candidate that meets minimum predeclared thresholds; record the rationale and unknowns.
8. Bound requests, message/history size, output tokens, duration, retries and usage. Record only trustworthy provider/model/usage/latency/cost metadata; redact secrets and avoid indiscriminate raw prompt retention.
9. Add tests for streaming start/finish/abort, provider timeout and malformed responses, authentication/project isolation, tool allowlisting, failed execution, tool-call duplicates, approval gates, usage limits and persisted-history conflict recovery.

### Exit gate

A signed-in project member can hold a multi-turn conversation, refresh and restore it, and safely invoke an allowed deterministic task. A user without authorization cannot read the history or execute a tool. Model output cannot forge evidence IDs, validation status or approval. Streaming and retries recover without duplicate effects. Default model selection has a documented task-quality and cost comparison; it is not chosen from price alone.

## M2 — Shared artifact/viewer registry and CAD visualization

**Outcome:** a user can inspect a supported CAD model directly beside the conversation and trace the view to the exact canonical engineering artifact.

### Work

1. Define a versioned artifact contract for type, format, ID, revision, project/source-object identity, originating operation, private storage URI, checksum, provider/runtime, units/coordinate frame, result metadata, validation receipt, evidence and known limitations.
2. Build a viewer registry/dispatcher that selects a specialized viewer from the trusted artifact type and format. Unknown formats receive a useful unsupported/download/conversion state.
3. Implement a 3D viewer using Three.js after verifying supported files and size/performance on representative fixtures. Use glTF/GLB only as explicitly linked display derivatives where appropriate. Do not replace canonical CAD or re-label an unvalidated export as verified.
4. Add orbit, zoom, pan, fit-to-view and orientation controls, loading/progress/error states, model revision identity and access checks. Measurements or properties appear only when supplied by trusted geometry/provider data.
5. Bind each preview to its source artifact ID, revision, checksum and conversion metadata. If the source revision changes, old dependent views and simulations become visibly stale rather than being displayed as current.
6. Preserve the existing private Supabase Storage, signed-URL expiry and project authorization boundaries. Treat uploads, converters and render inputs as untrusted.
7. Retain independent OCCT receipt checks and test failures for empty/corrupt geometry, unsupported format, checksum mismatch, permission denial, expired URL, conversion failure, large models and revision mismatch.

### Exit gate

Representative canonical CAD artifacts and supported derivatives render with predictable controls; source and display-derivative lineage remains visible; authorization and stale-revision tests pass; viewer failure does not modify engineering validation state; and M0 live CAD acceptance is green for the release revision.

## M3 — FEA mesh and field visualization

**Outcome:** supported mesh and solver-result artifacts can be inspected without making the viewer or a successful solve the engineering authority.

### Work

1. Define the accepted mesh/result formats and conversion path for the selected provider. Start with bounded Gmsh/CalculiX pilot fixtures rather than promising generic CAD-to-FEA.
2. Integrate VTK.js if its supported readers and the chosen normalized data format satisfy the fixtures. Keep conversion in a bounded backend/worker when needed, not in an untrusted server request.
3. Show mesh edges/surfaces and available scalar/vector fields such as stress, strain, displacement and temperature, with units, color legends and documented deformation scale.
4. Support probe values and overlays only when the source dataset supplies consistent node/element IDs, field locations, coordinate frames and boundary-condition metadata.
5. Display solver/version, completion/convergence status, mesh statistics, warnings and validation findings. Separate execution integrity, numeric checks, convergence/mesh-independence evidence and engineering approval.
6. Test against source values and supported formats, including malformed datasets, non-finite values, absent fields, unit mismatch, invalid topology, interrupted conversion and oversized files.

### Exit gate

Rendered field values, units and legends match source outputs for benchmark fixtures. Invalid data fails closed. Solver state and limitations remain visible. No UI status implies physical correctness or structural safety without the required, independently reviewed evidence.

## M4 — P&ID/PFD data model and visualization

**Outcome:** users can inspect process diagrams as structured engineering artifacts, not just static generated images.

### Work

1. Specify a typed diagram schema for symbols, equipment, ports, line segments, connectivity, flow direction, tags, layers, coordinate/layout data, schema version and source revision.
2. Implement an SVG or canvas renderer with pan/zoom, fit-to-view, symbol and layer selection, tag search and accessible labels.
3. Validate connections, required identifiers, unsupported symbols and inconsistent references before labeling a diagram accepted.
4. Link selectable elements to project equipment, calculations, requirements and evidence only through authorized, typed references.
5. Keep symbol sets and drafting conventions explicit and configurable. Claim standards compliance only after applicable requirements and validation fixtures have been implemented and reviewed.
6. Test round-trip identity/connectivity, rendering at multiple scales, malformed connections, missing tags, revision changes and project-isolation controls.

### Exit gate

Diagram structure round-trips without dropping element IDs or connections; representative schematics remain readable at tested sizes; validation findings and revision lineage are inspectable; authorization applies to diagram and linked project data.

## M5 — Other artifact viewers and one measured provider pilot

**Outcome:** add only result types and provider integrations whose user value, trust boundary and runtime acceptance are explicit.

### Work

1. Add charts/tables, PDFs, drawings, BOMs, engineering reports and other viewers through the registry. Reuse trusted artifacts; do not build a separate result database without need.
2. Evaluate point-cloud visualization/inspection only after its source branch, authenticated upload/persistence, known-transform/noise/outlier tests, artifact checks and review gates pass. Header/hash preflight or ICP fit alone is not dimensional verification.
3. Choose at most one additional provider pilot based on M0 outcomes and a documented user need. It may concern CAD or a bounded FEA path; do not promote overlapping providers in parallel.
4. Record exact provider/runtime version, license obligations, configuration, isolated resource controls, benchmark fixture digest, independent reference and validator, output digest, failed trials, limitations, reviewer decision and rollback.
5. Measure viewer performance, artifact failure rates and total cost per accepted result before widening scope.

### Exit gate

Each viewer supports its declared artifact types and safe failure paths. The selected provider passes the same capability-specific benchmark, independent validation and security/runtime gates. A pilot remains PILOT until promotion evidence and review are complete.

## Release controls and non-negotiable gates

- Work on a feature branch and open a pull request; do not push directly to main.
- Run npm ci, tests, the Webpack Next.js build/type-check, lint, architecture-boundary checks, and relevant provider/Playwright acceptance.
- Reconcile branch protections, required checks and security-scanner configuration before production release. A skipped scanner is unverified, not a pass.
- Use only dedicated non-production app/database/projects for E2E. Do not transfer test data or cookies into production.
- Check deployment and worker revision, secrets, runtime flags, database migration status and rollback before enabling new paths.
- Keep provider runtimes allowlisted, isolated, least-privileged and resource-bounded. No arbitrary generated code may execute inside the Next.js process.
- Evidence must bind the actual inputs and artifact bytes to the provider/validator versions and execution lineage. Hashes are integrity checks within their threat model, not proof of correctness.
- CI pass, render success, provider availability and process exit code prove only what those checks exercise.
- Do not claim certified FEA/CFD, general CAD/assembly coverage, standards compliance, safety or measured savings without capability-specific evidence and qualified review.

## Explicitly deferred

General-purpose free-form and assembly CAD, certified FEA/CFD safety conclusions, production manufacturing/CAM actions, autonomous consequential approval, broad robotics/ECAD/PLM rollout, and unrestricted model-generated code remain deferred pending a specific user need and separate capability-level acceptance contract.
