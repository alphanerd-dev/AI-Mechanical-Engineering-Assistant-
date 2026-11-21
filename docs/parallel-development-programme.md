# Parallel Engineering Development Programme

**Status:** Active execution programme  
**Established:** 8 November 2026  
**Scope:** Main product development alongside the proprietary Geometry Platform programme  
**Authority:** This programme coordinates work; the [Implementation Plan](implementation-plan.md) remains authoritative for milestone status and exit gates.

## Product and architecture alignment — 21 November 2026

The 20 November UX audit and 21 November architecture review establish the current product interaction target: **chat-first, task-oriented, evidence-backed engineering workflows**. This is a target direction, not a statement that chat dispatch is already implemented. The current chat remains guidance-oriented and the Engineering Core remains the separate execution surface until the authenticated chat-to-task milestone passes.

The near-term order is: (1) validate the recurring customer problem and first paid-value workflow; (2) unify TaskSpec, task/job/event and result states; (3) integrate chat with host-controlled task proposal, policy, readiness and approval; (4) complete durable progress, recovery and event delivery; (5) add secure attachments and project file lifecycle; (6) complete one accepted CAD and one bounded FEA journey; (7) simplify navigation, protect administrative controls and close accessibility gaps. Keep the proprietary Geometry Platform independent except where a specific operation requires its capability.

Framework position: selectively use TanStack Query for remote server state and Zustand for ephemeral shared UI state; defer Redux Toolkit and Redis; use FastAPI only for Python services that need a persistent typed API; keep Next.js as the control plane. LangGraph and Temporal remain conditional, not default dependencies. See [Architecture](architecture.md), [Implementation Plan](implementation-plan.md) and [Product Experience and Architecture Alignment](product-experience-and-architecture-alignment.md).

## Historical execution snapshot — 15 November 2026

This is a historical snapshot. Its operational and deployment statements are preserved as recorded at the time; use the 21 November alignment section above and the current Implementation Plan for present priorities and status. PRs #165 and #166 are merged. The production application is READY at merge commit `9bfb57e86e70db84a682d162bba9253e0185c920`; the eight additive geometry/manufacturing migrations are applied and verified in production. The geometry and manufacturing capabilities are part of the current production release.

| Workstream | Verified state | Remaining boundary |
|---|---|---|
| G2 geometry identity | PRs [#163](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/163) and [#165](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/165) are merged. Immutable revision schema, project-authorized persistence/history APIs, server-side BREP SHA-256/provenance verification, host-derived provider version, idempotency, expected-parent concurrency and atomic audit are implemented. | G3 native mathematical primitives remain a future milestone; no native geometry kernel is delivered yet. No native geometry kernel is delivered. |
| CAD / M2.2–M2.6 | Geometry, viewport, drawing and artifact workflow code is merged on `main` (commit `518b5e1`). | Authenticated project/database E2E and paired desktop/Android renderer benchmark/selection remain separate acceptance gates. |
| CFD / OpenFOAM 14 | Bounded Poiseuille worker, provider, analytical acceptance, artifact digest checks and worker smoke coverage are present on `main` (commit `058c633`). Exact-head checks were reported passing in the commit record. | One laminar benchmark only; capability remains EXPERIMENTAL. Production worker endpoint/configuration and broader mesh/refinement validation are not claimed. |
| Manufacturing | PRs #155 and [#166](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/166) are merged. Immutable project-scoped readiness snapshots and independent append-only APPROVED/REJECTED decisions include four-eyes authorization, idempotency and atomic audit. | Inputs are `USER_SUPPLIED_UNVERIFIED`; no CAM execution, MES dispatch, machine control or production release is performed. |
| Authentication | Password recovery/PKCE and first-party HIBP k-anonymity screening are present on `main` (commit `79ecb65`). Issue [#146](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/issues/146) was closed as **Not Planned** by owner direction; Supabase remains on Free. | Application screening does not equal native Supabase platform-wide leaked-password protection. No paid upgrade or Auth-setting change was made. |
| Production deployment | Vercel deployment `dpl_GWprsLfzpeboh45REeM1gwwhNN5c` is READY at merge commit `9bfb57e86e70db84a682d162bba9253e0185c920`; production alias points to it. Eight additive geometry/manufacturing migrations are present in production migration history. | Production code/schema deployment is complete. The production release includes the merged geometry revision and manufacturing evidence capabilities. |

### Next execution order

1. Complete CAD/drawing artifact workflow validation, stale-source behavior and paired desktop/Android renderer benchmark/selection.
2. Advance G3 native geometry primitives only behind provider-neutral conformance and regression gates.
3. Keep FEA visualization, durable app-level CFD execution and connected CAD-to-CAE workflows behind their capability-specific evidence gates.
4. Expose bounded LLM orchestration only after durable run journaling, per-action idempotency, lease recovery and capability-specific safeguards are complete.

All status claims above are scoped to the named commit, environment and test evidence. A merged schema or successful build does not imply production migration, user-facing integration or engineering validation.


## 1. Decision

Develop the AI Mechanical Engineering Assistant through parallel, independently testable workstreams. The proprietary Geometry Platform is one enabling subsystem, not a prerequisite for the whole product.

The main application must continue delivering engineering intelligence, CAD/CAE workflows, manufacturing capabilities and user-facing value using existing providers and contracts. The Geometry Platform progresses separately and is integrated through stable, versioned interfaces.

**No workstream may wait for native geometry algorithms unless its specific operation genuinely requires a capability that existing providers cannot supply.**

## 2. Product invariants

1. **AI proposes; deterministic systems execute; validation decides; evidence proves.**
2. Chat, planning, execution, validation, verification and human approval remain distinct states.
3. Reuse the existing project/workspace identity, authorization, capability router, execution workers, artifact/evidence records and persistence. Do not create competing registries or task systems.
4. Provider adapters isolate vendor/runtime specifics. Product contracts must not expose OCCT, build123d, OpenFOAM, CalculiX, Gmsh or renderer-specific types as universal domain contracts.
5. Canonical engineering data, simulation inputs/outputs and display derivatives remain distinct and traceable to exact revisions and digests.
6. A successful build, worker process or rendered result is not proof of physical adequacy, numerical convergence, engineering verification or approval.
7. Production promotion requires capability-specific security, licensing, benchmark, validation, evidence, operational and rollback gates.

## 3. Workstreams

### WS-A — Engineering AI and bounded orchestration

**Objective:** Turn engineering intent into structured, reviewable plans and useful engineering decisions without giving probabilistic model output authority over execution or validation.

**Scope**
- Intent interpretation and missing-input detection.
- Reusable engineering skills and reasoning frameworks through the existing Engineering Core.
- Bounded task plans, dependency resolution and capability routing.
- Project context and artifact-aware explanations.
- Engineering calculations and source-backed research, with assumptions and uncertainty explicit.
- Human approval gates for consequential actions.

**First increments**
1. Reconcile reasoning-framework and intent contracts with the current capability catalog.
2. Implement one end-to-end skill using an existing deterministic capability.
3. Add plan preview, input validation, execution-state and evidence links.
4. Add adversarial tests for ambiguous intent, missing inputs, unsupported operations and prompt-injection content in retrieved artifacts.

**Exit gate:** The model can propose a typed plan; only registered deterministic capabilities execute; results and evidence are independently validated; unsupported or risky work fails closed.

**Geometry dependency:** None for text reasoning and non-geometric calculations. Geometry-dependent plans use existing CAD providers and explicit geometry interfaces.

### WS-B — CAD, FEA and CFD integration

**Objective:** Expand useful design and simulation workflows through replaceable providers, without waiting for a proprietary kernel.

**CAD**
- Continue the bounded build123d authoring and OCCT validation path.
- Develop CAD provider adapters and interchange workflows only for named formats and use cases.
- Advance M2 artifact lineage and the renderer benchmark before claiming a general interactive CAD viewer.
- Preserve canonical geometry versus tessellated display derivatives.

**FEA**
- Evolve the existing Gmsh/CalculiX reference worker through named benchmark cases.
- Add mesh/result artifact contracts and M3 scientific-field visualization.
- Add mesh-quality, convergence, reaction-balance and analytical-reference checks as capability-specific evidence.
- Do not generalize the cantilever reference worker into arbitrary solver-deck execution without a separate security and validation design.

**CFD**
- Define the OpenFOAM provider boundary, case manifest, mesh/field artifact contracts and isolated worker requirements.
- Start with one reproducible, known-answer benchmark and documented boundary conditions.
- Add solver execution only after resource limits, deterministic inputs, provenance, independent checks and failure recovery are established.
- Treat CFD visualization as scientific field rendering, not merely CAD rendering.

**Exit gate:** Each supported workflow has pinned provider/runtime identity, reproducible inputs, bounded isolated execution, independent capability-specific checks, exact artifact lineage and honest maturity status.

**Geometry dependency:** CAD/FEA/CFD may consume existing geometry providers. Native geometry is not a prerequisite. Operations that require exact BREP/topology must declare that requirement and route to the accepted provider.

### WS-C — Manufacturing and industrial automation

**Objective:** Connect design intent to manufacturability, process planning, quality, maintenance and reliability workflows.

**Initial candidate capabilities**
- Design-for-manufacturing and manufacturability checks.
- Process planning and operation sequencing.
- Manufacturing resource and machine capability matching.
- Inspection planning, quality records and nonconformance workflows.
- Maintenance diagnostics, failure analysis and reliability workflows.
- BOM, routing, revision and change-impact relationships.

**First increments**
1. Inventory current manufacturing/inspection catalog entries and classify each as implemented, pilot, experimental or research-only — **completed in the manufacturing capability inventory**.
2. Select one narrow workflow: machined-part manufacturing readiness using existing DFM, process-plan, BOM, inspection and artifact-link checks — **selected and implemented on the manufacturing-readiness pilot branch**.
3. Define inputs, assumptions, process constraints, outputs and review requirements — **implemented as a typed readiness request/result contract**.
4. Integrate through existing capability, artifact, task and evidence contracts — **provider capability and router tests added; persistent records remain out of scope**.
5. Begin with advisory/planning automation. Do not issue direct machine-control commands until a separate safety, authorization, interlock and operational certification programme exists.

**Exit gate:** A bounded workflow produces traceable recommendations or records, identifies assumptions and constraints, supports human review, and does not imply machine execution or production release unless those paths are separately implemented and approved.

**Geometry dependency:** DFM checks may consume geometry measurements from existing providers. Maintenance, quality records, process planning and many lifecycle workflows do not require the Geometry Platform.

### WS-D — User-facing product and workspace

**Objective:** Make the product coherent and usable as an integrated engineering workspace rather than a collection of disconnected demos.

**Scope**
- Project workspace and navigation.
- Chat-first task interaction as the target product journey; deterministic Engineering Core workflows remain separate internally behind authenticated policy and execution services.
- Artifact browser, task history, workflow state and evidence inspection.
- CAD/CAE viewers and drawing/diagram surfaces as their milestones pass.
- Responsive desktop and representative Android browser support.
- Clear capability availability, maturity, limitations and error recovery.
- User onboarding, empty states, permissions and collaboration where justified.

**First increments**
1. Continue M2 shared artifact contract and trusted viewer registry work.
2. Benchmark Babylon.js versus Three.js using identical fixtures; keep VTK.js evaluation separate for scientific fields.
3. Deliver CAD viewer MVP only after artifact authorization, lineage and stale-state handling pass.
4. Deliver M3 FEA field visualization with numerical fidelity checks.
5. Make one conversational journey the primary user experience for planning, progress and results; retain deterministic execution as a separate internal authority, not a competing user-facing submission destination.

**Exit gate:** Authenticated user acceptance on desktop and representative mobile devices; accessibility and responsive checks; correct authorization; safe failure states; no visual surface can alter validation or approval state.

**Geometry dependency:** Only geometry-specific viewers and operations depend on geometry adapters. The rest of the workspace can progress independently.

### WS-E — Proprietary Geometry Platform

**Objective:** Own product-level geometry semantics and progressively implement selected native algorithms while retaining mature providers as fallbacks.

**Sequence**
- G0: architecture and repository audit — **merged in PR #138**.
- G1: bounded, versioned geometry operation API — **merged in PR #139**.
- G2: immutable geometry revision identity and trusted persistence — PRs #163 and #165 merged; schema and persistence/read APIs are deployed, and additive migrations are applied to production. G3 native mathematical primitives are the next geometry milestone, subject to provider-neutral conformance and regression gates.
- G3: native mathematical primitives, curves, surfaces and measurements.
- G4: native topology and Boolean operations.
- G5: advanced features such as fillets, chamfers and shelling.
- G6: interoperability, performance and conformance hardening.

**Promotion gate:** Differential tests against trusted providers, analytical reference cases, numerical/tolerance tests, adversarial and degeneracy fixtures, regression tests, resource limits, format round-trips where applicable and documented fallback behavior.

**Explicit non-goals:** No immediate OCCT replacement, no premature standalone repository, no claim of a complete Parasolid/ACIS-class kernel, and no switch of production CAD routes merely because a facade exists.

## 4. Dependency policy

| Consumer/workstream | May proceed using current foundations | Must wait for geometry platform |
|---|---|---|
| Engineering AI and reasoning | Yes | Only for geometry-specific operations lacking a supported provider |
| Engineering calculations | Yes | No, unless a calculation explicitly requires geometric evaluation |
| CAD authoring and interchange | Yes, through current/adapted providers | Native geometry operations only |
| FEA execution | Yes, through current mesh/solver providers | No; exact geometry needs are handled by declared adapters |
| CFD workflow design and benchmark preparation | Yes | No |
| CFD production workflow | Yes, after solver/mesh/validation gates | Only if a required geometry operation has no accepted provider |
| Manufacturing planning, maintenance and quality | Yes | Usually no |
| Product UX, workspace and collaboration | Yes | No |
| CAD topology editing using proprietary native algorithms | Limited | Yes, until those operations pass conformance |

A workstream dependency must be recorded as a specific contract or operation, not as a vague statement that it “depends on geometry.”

## 5. Integration contracts

All workstreams use the existing shared platform foundations:

- Project and workspace identity plus server-side authorization.
- Versioned capability request/result contracts.
- Durable task/execution state and idempotency where applicable.
- Artifact identity, immutable source revision, digest and derivative lineage.
- Explicit units, coordinate frames, assumptions and provider/runtime versions.
- Capability-specific validation receipts and evidence references.
- Human approval for risk-bearing or release-critical actions.
- Structured observability, resource limits, cancellation and recovery.

Geometry-specific fields belong in geometry contracts. Solver-specific fields belong in simulation contracts. Renderer types stay inside viewer adapters. Do not create a universal mega-schema.

## 6. Delivery order and concurrency

### Priority 0 — Protect the baseline
- Preserve G1/G2 schema compatibility and verify all geometry-revision consumers.
- Continue capability-specific regression, artifact-lineage and audit-integrity testing as the geometry and manufacturing workflows evolve. Production migrations have been applied; do not repeat them.
- Complete M2.2–M2.6 authenticated artifact/drawing workflows and renderer selection on paired desktop/Android devices.
- Keep bounded LLM product-route exposure disabled until durable run journaling, per-action idempotency, lease recovery and authenticated acceptance are complete.

### Priority 1 — Parallel product foundations
- WS-D: M2.2–M2.6 CAD, OCCT import/tessellation, drawing ingestion and renderer-neutral viewer foundation are merged; authenticated browser/storage acceptance and renderer selection remain.
- WS-A: bounded LLM operational authority and typed model-plan validation are merged at the core layer; product-route exposure remains blocked on durable run journal/lease recovery.
- WS-B: build123d/OCCT CAD and open FEA worker foundations are present; the OpenFOAM 14 Poiseuille worker is present on `main` but remains experimental and is not yet wired to the durable app execution boundary.
- WS-C: deterministic readiness pilot and durable assessment/decision records are merged and deployed.
- WS-E: G0/G1/G2 schema, contract and trusted persistence/read APIs are merged and deployed; native algorithm development remains gated on G2 acceptance.

### Priority 2 — Connected engineering workflows
- Authenticated CAD/drawing artifact acceptance, stale-source behavior and paired-device renderer benchmark.
- FEA mesh/result visualization under M3.
- One CAD-to-CAE workflow with exact source lineage and independent checks.
- Manufacturing assessment and four-eyes decision acceptance; no CAM/MES dispatch.
- Attach the experimental CFD worker to the durable execution boundary only after provider/runtime, numerical and artifact acceptance gates.

### Priority 3 — Expand only on evidence
- Broader multi-CAD, advanced CFD, scan-to-CAD, robotics/dynamics and electromechanical integrations.
- Native geometry operations promoted individually after conformance.
- Production automation only with explicit authorization, safety controls and operational acceptance.

These priorities define sequencing, not fixed calendar dates or a promise to staff every stream simultaneously.

## 7. Branching, ownership and change control

- Keep each independently reviewable workstream on a focused feature branch and pull request.
- Avoid long-lived stacked branches unless a strict dependency requires them. Rebase or retarget only after verifying the parent change is merged.
- Shared contract changes require impact analysis and compatibility tests for all declared consumers.
- No unrelated workstream should edit the same canonical file concurrently without coordinating the change.
- Prefer vertical slices: user task → typed capability → bounded provider → artifact/evidence → validation → UI acceptance.
- Do not merge a documentation-only or facade-only change as proof that an end-user capability is shipped.

## 8. Verification and release gates

Every pull request must declare:
1. Exact user workflow and supported scope.
2. Changed contracts, providers, data migrations and runtime dependencies.
3. Unit, integration, worker and regression tests required.
4. Security, authorization, resource and failure-path checks.
5. Numerical or domain-specific reference evidence where applicable.
6. Artifact lineage and validation semantics.
7. Browser acceptance and accessibility checks when UI changes.
8. Deployment/rollback implications and exact tested commit.

CI status is tied to the exact commit SHA. A later commit requires fresh verification. Production deployment and runtime health are separate from CI success.

## 9. Programme metrics

Track outcomes rather than feature counts:
- Time to first accepted engineering result.
- Total cost per accepted outcome.
- Net engineering time saved on matched tasks.
- First-pass acceptance and rework rate.
- Validation/evidence completeness.
- Failure recovery and task resumption.
- Provider reliability, latency and resource consumption.
- User task completion and repeat use.

Current real-world economic outcomes remain **NOT MEASURED** until matched user trials are collected. Do not infer productivity or safety gains from unit tests, synthetic fixtures or successful builds.

## 10. Historical verified baseline (13 November 2026)

This section preserves the 13 November snapshot. Its branch, migration and deployment statements are historical and are superseded by the 15 November execution snapshot at the top of this document.

### Merged foundations
- PR #131 — Engineering OS v11.2 UI foundation.
- PR #138 — G0 geometry architecture.
- PR #139 — G1 bounded geometry operation API.
- PR #141 — parallel engineering development programme.
- PR #142 — Engineering R&D skill profile.
- At that historical point, the G2 merge commit `132436fd1cf4ca66ec122ca13d8313e2b4681b84` was the deployed production version. PR #165/#166 were not yet deployed.

### Active pull requests and verified status

| PR | Scope | Current status |
|---|---|---|
| #163 | G2 immutable geometry identity/revision schema and contract | Merged; production application deployment READY. E2E schema rehearsal passed; production schema remains unchanged. |
| #144 | Bounded LLM operational authority | Merged; typed model-plan validation and backend policy enforcement exist at the core layer. Product-route exposure remains blocked on durable run journaling, action idempotency and lease recovery. |
| #154 | Consolidated M2.2–M2.6 CAD, OCCT, GLB viewport and drawing workflows | Merged; code is on `main`. Authenticated artifact/drawing E2E and renderer selection remain open. |
| #155 | Deterministic machined-part manufacturing readiness | Merged; readiness remains advisory and does not dispatch production. |
| #165 | G2 trusted geometry revision persistence/read API | Merged and deployed on 15 November 2026; see current execution snapshot. |
| #166 | Durable manufacturing assessments and independent human decisions | Merged and deployed on 15 November 2026; see current execution snapshot. |
| CFD worker | OpenFOAM 14 bounded laminar Poiseuille worker | Implementation is present on `main` at `058c633`; worker image, authenticated smoke and analytical acceptance passed in that commit's exact-head CI. The app provider remains experimental and not wired to the durable execution boundary. |

### Implementation boundaries

- PR #163 merged the G2 identity schema and contract; PR #165 subsequently added trusted server-side revision persistence and atomic audit. At the historical snapshot, production migration and authenticated acceptance were still pending.
- PR #144 merged bounded model-directed planning and operational authority at the core layer, but does not authorize direct production execution. Durable run journaling, per-action idempotency and lease recovery are still required before route exposure.
- PR #154 merged CAD/drawing workflows through isolated OCCT and existing geometry providers. Authenticated browser/storage acceptance and renderer selection remain separate gates.
- PR #155 merged deterministic manufacturing-readiness assessment. PR #166 subsequently added durable snapshots and independent append-only human decisions with four-eyes authorization; neither path issues a production release, CNC program or machine-control command.
- The OpenFOAM 14 worker is present on `main` and passed its bounded Poiseuille worker smoke/analytical acceptance in the recorded commit CI. The app provider remains experimental and not wired to durable execution; no general-purpose CFD claim is made.

### Data, security and release gates
- Production migration history reconciliation (issue #145) is complete; the production ledger matches the 18 canonical repository migrations. The historical cause of the former alternate chat-metadata timestamp was not recoverable.
- At the historical snapshot, PR #165's G2 persistence migration and PR #166's manufacturing record migrations were applied only to the dedicated E2E Supabase project. This statement is superseded by the 15 November production migration record above.
- PR #154 still requires authenticated BREP/STEP → OCCT → GLB → private storage → signed URL → browser viewport E2E, drawing upload/list/preview E2E, cross-project denial tests, and desktop/mobile browser acceptance.
- Issue #146 is closed as Not Planned at the product owner's direction to retain Supabase Free. Native Supabase leaked-password protection remains disabled; first-party HIBP screening is separate and remains in the application.
- OpenFOAM worker smoke passed for the single laminar Poiseuille case in commit `058c633`; broader mesh refinement, other flow regimes and app-level durable execution remain out of scope.
- PRs #163 and #164 were merged and the G2 production app deployment reached READY. PRs #165 and #166 remain open; no production schema migration, production worker activation, destructive operation or external service purchase was performed.

### Product maturity boundaries
- Manufacturing DFM, process-plan validation, inspection acceptance, BOM generation and readiness assessment remain deterministic pilot/advisory capabilities. Durable assessment snapshots and independent human decision records are now merged and deployed;  Inputs are user-supplied/unverified. Economics and release evaluation remain experimental; CAM reports unavailable without a real toolpath runtime. Machine matching, quality nonconformance, ERP/MES and maintenance analytics remain research-only.
- The OpenFOAM worker supports one bounded laminar plane-Poiseuille benchmark only. Turbulence, multiphase flow, heat transfer, arbitrary dictionaries, general-purpose CFD and production certification are not supported.
- Broad multi-CAD interoperability, scan-to-CAD, advanced robotics and electromechanical integration remain separate roadmap increments.
- Current real-world economic outcomes remain **NOT MEASURED** until matched user trials are collected.

Update this section only when new evidence changes the recorded state. The Implementation Plan and Engineering Capabilities document remain authoritative for current product maturity.
