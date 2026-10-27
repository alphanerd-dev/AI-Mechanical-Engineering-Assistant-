# Implementation Plan and Milestones

**Updated:** 27 October 2026  
**Status:** Active plan; implementation and live readiness claims require evidence on the exact revision.

This is the single source of truth for upcoming work, priorities, dependencies and exit gates. See the [Product Brief](product-brief.md) for the agreed experience and [Engineering Capabilities](engineering-capabilities.md) for the distinction between existing provider contracts and supported live capabilities.

## Product and engineering rule

**AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**

Keep the existing Next.js/React/TypeScript control plane, Supabase project/workspace and authorization, provider-neutral Engineering Core, capability routing, deterministic execution, isolated workers, independent validators and artifact/evidence contracts. Add libraries and abstractions only where they close an evidenced gap.

The current product decision is to implement assistant-ui + Vercel AI SDK for a streamed conversational experience over a configurable OpenAI-compatible hosted model endpoint. The model vendor/model is not yet selected; lowest practical API cost is the priority subject to measured capability and reliability. Three.js, VTK.js and a typed SVG/canvas diagram renderer are proposed for later visualization milestones, not currently installed viewer features.

## 1. Current baseline, known gaps and blockers

The current main branch head is the documentation-only merge [76425a0](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/76425a096d52c87741222645a65d616ff773460a). The source code baseline reviewed before that documentation-only merge is [5da2823](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/5da2823ff7792cb23e9ae36b193cd627f2d4d7ba).

| Area | Evidence / finding | Consequence |
|---|---|---|
| Existing source CI | [Core CI](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39644040159), ESLint, CodeQL and Codacy passed for the reviewed code revision. | Good repository-level baseline; does not prove live provider connectivity or general engineering correctness. |
| Live CAD acceptance | [Run 39634636058](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634636058) stopped during preflight because CAD_WORKSPACE_BASE_URL was absent. Authenticated testing did not run. | Blocked/unverified, not a CAD algorithm failure and not a live pass. |
| CAD application pipeline | Bounded cylindrical intent, build123d worker, OCCT BREP validation, project-scoped persisted records and evidence contracts exist. | Re-run authenticated non-production acceptance on the exact current revision before claiming live readiness. |
| FEA | Gmsh/CalculiX and PyMechanical provider contracts/pilots exist. | Runtime availability and current artifact/field pipeline must be verified; execution integrity is not a safety verdict. |
| Conversational AI | A project-scoped persisted engineering conversation and structured reasoning workbench exist. The model transport is configured for structured proposals/intent interpretation. | The selected assistant-ui streaming chat integration is not yet implemented. |
| Dependencies and chat route | The inspected package.json does not include assistant-ui or Vercel AI SDK; no dedicated streaming chat route was found. | Add and pin compatible versions only in the feature PR; check current official integration guidance before choosing versions. |
| Viewers | The inspected source contains CAD status/history/metadata surfaces but no complete interactive CAD or VTK-based FEA viewer; no P&ID renderer was identified. | Treat these as new features. Do not represent provider or artifact metadata as a rendered visualization. |
| Cost baseline | No reviewed task-level cost/quality baseline selected a default hosted model. | Compare current model prices and representative engineering tasks before choosing the default. |

The above observations are revision-specific. Recheck exact SHA, build, CI, runtime and workflow evidence before promoting a release.

## Milestone overview

| ID | Milestone | Priority/status | Depends on |
|---|---|---|---|
| M0 | Trustworthy decisions, failure recovery, outcome baseline and live CAD acceptance setup | **IN PROGRESS — PR #121; exit gate not passed** | Existing API/result contracts |
| M1 | Secure streamed AI conversation and controlled engineering tools | **PLANNED after M0 acceptance design** | Existing auth, session persistence, model transport |
| M2 | Shared artifact/viewer registry and interactive CAD visualization | **PLANNED** | Artifact/access contract; M0 CAD acceptance remains a release gate |
| M3 | FEA mesh and result-field visualization | **PLANNED** | M2 artifact/viewer contract; a supported solver-output path |
| M4 | Typed P&ID/PFD model and viewer | **PLANNED** | Shared artifact/version/access contract |
| M5 | Additional artifact viewers and one evidence-backed provider pilot | **DEFERRED until need and value are measured** | M0–M4 evidence and a specific user need |

Milestones describe ordered outcomes; they are not proof that their capabilities are already delivered. Small UI and design-contract changes can be reviewed together where dependency is clear, but each exit gate must remain independently auditable.

## Current branch implementation evidence — PR #121

The feature branch adds the following M0/design-contract work on top of the 22 October main baseline:

- Status-aware engineering decision presentation that keeps proposal, execution, validation, verification, human approval, failure and freshness separate.
- Intent transport-failure guidance that retains the draft and warns that the server may have received the request; it does not automatically replay an operation.
- A shared responsive workspace shell and source-backed project context. Planned routes remain labelled as planned rather than exposed as working links.
- A project create flow that makes the user review the entered problem before the single create request, and warns/guards against blindly repeating a request whose outcome is unconfirmed.
- Design handoff source files, semantic CSS/JSON tokens, component and UX contracts, wireframes, screen inventory, original implementation prompt, and capture QA note under `docs/design/forge-v11.2/`.

These are code changes in an open, draft PR; they are not yet a production release. Check the exact head SHA in the PR before relying on CI results. The PR's previous green run is not a substitute for checks on a later commit.

### Remaining M0 blockers

1. **Current-branch preview:** Vercel preview deployments have been failing immediately with `BUILD_FAILED: Resource provisioning failed` and no build events. The integration/provisioning path is a hypothesis, not a confirmed root cause. Do not rotate credentials, reconfigure the marketplace integration, or promote a preview until the project owner reviews the connection.
2. **Visual acceptance:** Desktop 1440px and mobile 390px screenshots of the current branch have not been compared against the v11.2 reference because the branch preview cannot be rendered.
3. **Live CAD acceptance:** The current feature SHA has not passed the dedicated non-production authenticated intent-to-verified-artifact workflow. The protected environment must use its configured isolated project/model/worker endpoint and short-lived cookie; production data and cookies must not be used.
4. **Final exit gate:** Full Core CI, changed-source lint and security checks must pass on the exact final code SHA. Then run the isolated browser acceptance, review its evidence, and verify app/worker revisions plus database migration state.

## M0 — Trustworthy decision surfaces, recovery and outcome measurement

**Outcome:** every currently supported workflow gives a truthful, recoverable engineering decision, and its current-revision runtime status can be verified without confusing a blocked environment with a failed algorithm.

### Work

1. Map each existing result state to a clear UI/API outcome: PROPOSED, NEEDS_INPUT, UNSUPPORTED, EXECUTED, VALIDATED, VERIFIED, WAITING_APPROVAL, FAILED, and other states only where defined by the current contract.
2. Render values and units, assumptions, validation/evidence status, provenance, blockers, limitations, approvals and next action only when the source response provides them. Never infer verification from HTTP 200 or a single boolean with a weaker contract.
3. Preserve drafts and trusted project context after transport, authorization, provider, validation or persistence failures. Make recovery explicit. Do not blindly replay a mutating CAD request or create duplicate jobs, artifacts or evidence.
4. Complete component/API/Playwright coverage for missing inputs, unsupported intent, validation failure, approval-required states, timeout, failed persistence, authorization denials and safe recovery.
5. Instrument representative tasks: time to accepted outcome, measured engineering-active time including review/correction, stage latency, tool calls, retries/recovery, evidence completeness and available cost components. Mark unmeasured values unknown.
6. In parallel with the UI work, resolve the CAD live-acceptance environment configuration. The protected environment requires CAD_WORKSPACE_BASE_URL, CAD_WORKSPACE_PROJECT_ID, CAD_WORKSPACE_MODEL_ID and a short-lived CAD_WORKSPACE_COOKIE secret. Use only a dedicated non-production project/account; never print or commit the cookie.
7. Verify deployed app and worker/source image revisions, worker health, auth, private storage, immutable image digests, required migrations and the durable-execution feature flag before enabling relevant paths. Do not infer that migrations were applied from a skipped reconciliation job.
8. Preserve the current CAD acceptance chain: typed cylindrical intent → deterministic build123d source → isolated worker → artifact registration → independent OCCT BREP validation → receipt bound to exact BREP bytes and trusted project/model/run lineage.

### Exit gate

The result-state matrix and important negative paths are tested; failure does not appear as silent success; saved work survives recoverable failures; retries cannot duplicate non-idempotent effects; CAD acceptance passes on the exact current revision in non-production; retrieved private BREP bytes match the stored digest and validation receipt. If environment configuration is still missing, report M0 CAD live acceptance as BLOCKED.

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
