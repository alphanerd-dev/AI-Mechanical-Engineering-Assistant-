# Parallel Engineering Development Programme

**Status:** Active execution programme  
**Established:** 8 November 2026  
**Scope:** Main product development alongside the proprietary Geometry Platform programme  
**Authority:** This programme coordinates work; the [Implementation Plan](implementation-plan.md) remains authoritative for milestone status and exit gates.

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
- Conversational chat and separate Engineering Core task interaction.
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
5. Keep chat and deterministic task execution visibly distinct.

**Exit gate:** Authenticated user acceptance on desktop and representative mobile devices; accessibility and responsive checks; correct authorization; safe failure states; no visual surface can alter validation or approval state.

**Geometry dependency:** Only geometry-specific viewers and operations depend on geometry adapters. The rest of the workspace can progress independently.

### WS-E — Proprietary Geometry Platform

**Objective:** Own product-level geometry semantics and progressively implement selected native algorithms while retaining mature providers as fallbacks.

**Sequence**
- G0: architecture and repository audit — **merged in PR #138**.
- G1: bounded, versioned geometry operation API — **merged in PR #139**.
- G2: immutable geometry revision identity, canonical representation and revision relationships — **design in draft PR #143; implementation remains blocked by migration-history reconciliation in issue #145**.
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
- G1 PR #139 is merged; preserve its API compatibility and continue consumer conformance.
- Review G2 design PR #143 against the live schema and migration ledger; do not apply its migration until issue #145 is resolved and the E2E rehearsal is approved.
- Complete PR #154 M2.2–M2.6 exact-head verification and browser acceptance before merge.
- Complete PR #144 bounded LLM authority review without enabling a production agent route or feature flag.

### Priority 1 — Parallel product foundations
- WS-D: M2 artifact contracts, viewer registry and renderer benchmark are being completed in PR #154.
- WS-A: bounded LLM operational authority and typed model-plan validation are in draft PR #144.
- WS-B: OCCT/build123d CAD and open FEA runtime workflows are being integrated in PR #154; CFD remains at provider-boundary/benchmark preparation.
- WS-C: manufacturing inventory is complete; the machined-part readiness pilot is implemented on `feat/manufacturing-readiness-pilot`.
- WS-E: G1 is merged; G2 design is in PR #143 and awaits migration-history reconciliation.

### Priority 2 — Connected engineering workflows
- CAD artifact viewing and drawing foundation after M2 gates.
- FEA mesh/result visualization under M3.
- One CAD-to-CAE workflow with exact source lineage and independent checks.
- One advisory manufacturing workflow with human review.
- CFD provider prototype and reproducible benchmark; promote only after worker and numerical gates.

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

## 10. Current verified baseline (13 November 2026)

### Merged foundations
- PR #131 — Engineering OS v11.2 UI foundation.
- PR #138 — G0 geometry architecture.
- PR #139 — G1 bounded geometry operation API.
- PR #141 — parallel engineering development programme.
- PR #142 — Engineering R&D skill profile.
- Production `main` was READY at commit `fb64bfdb5908fd49a5f9a26b89a62083b7b0bcba` at the start of this development cycle. No production deployment was initiated by this cycle.

### Active pull requests and verified status

| PR | Scope | Current status |
|---|---|---|
| #140 | M2.1 revision-aware CAD lineage and viewer foundation | Superseded as a standalone merge candidate by the consolidated continuation in PR #154; its changes are included in that branch. Do not merge separately while #154 is under review. |
| #143 | G2 immutable geometry identity/revision design and schema audit | Draft; exact-head Engineering Core CI, ESLint, CodeQL and Codacy passed. No migration has been applied. |
| #144 | Bounded LLM operational authority | Draft; exact-head Engineering Core CI, ESLint, CodeQL and Codacy passed. No production agent route or feature flag is enabled. |
| #154 | Consolidated M2.2–M2.6 CAD, OCCT, GLB viewport and drawing workflows | Draft; exact-head Engineering Core CI, CodeQL and Codacy passed on the monitored head. ESLint initially failed during scanner installation because npm resolved unavailable `ai@7.0.173`; the isolated scanner workflow has now been applied and fresh exact-head checks are running. |
| #155 | Deterministic machined-part manufacturing readiness | Draft; exact-head full Engineering Core CI, production TypeScript build, ESLint, CodeQL and Codacy passed at `8414998fb2e3c34f2e684c3dfac11e3da28771dc`. |
| #156 | OpenFOAM 14 bounded CFD benchmark and isolated worker | Draft; worker contract, authenticated HTTP service, artifact retrieval, TypeScript executor and real-solver CI smoke test have been implemented. Exact-head CI and actual numerical acceptance remain in progress; do not claim CFD execution is verified until the worker smoke and provider acceptance gate pass. |

### Implementation boundaries

- **PR #154 supersedes PR #140** as the reviewable M2.1–M2.6 CAD/drawing delivery. PR #140 remains open only as a historical foundation; it should not be merged independently.
- PR #143 is design/audit documentation. The G2 migration remains blocked by migration-history reconciliation in issue #145 and requires a separate approved migration rehearsal.
- PR #144 introduces bounded model-directed planning and operational authority, but does not authorize direct production execution. Its exact-head automated checks pass; authenticated preview/browser acceptance and production worker readiness remain separate gates.
- PR #154 implements CAD/drawing workflows through isolated OCCT and existing geometry providers. Its latest source requires fresh ESLint and preview/browser acceptance after the scanner workflow correction.
- PR #155 provides deterministic manufacturing-readiness assessment and artifact-link checks. It returns `READY_FOR_HUMAN_APPROVAL`, `BLOCKED` or `INCOMPLETE`; it does not issue a production release, CNC program or machine-control command.
- PR #156 contains a real OpenFOAM 14 worker image and authenticated API, but the web application provider remains unconfigured until it is attached to the durable execution boundary. The capability remains experimental; no general-purpose CFD claim is made.

### Data, security and release gates
- No production Supabase migration, migration-history repair, Auth configuration change, feature-flag change, merge or production promotion was performed by this cycle.
- The PR #154 M2 migration remains additive and un-applied to production. Preview RLS, private storage, signed URL, trigger and audit-chain E2E remain required.
- Issue #145 remains open: the cause of the final production migration timestamp mismatch has not been proven and canonical history repair has not been approved.
- Issue #146 remains open: leaked-password protection is disabled in production and E2E. Enabling it requires product-owner approval after authentication-flow testing.
- PR #154 still requires authenticated BREP/STEP → OCCT → GLB → private storage → signed URL → browser viewport E2E, drawing upload/list/preview E2E, cross-project denial tests, and desktop/mobile browser acceptance.
- PR #156's worker smoke must run with network disabled, read-only root filesystem, dropped capabilities and bounded CPU/memory. The returned artifacts must be downloaded and SHA-256 checked, then the actual solver result must pass the independent TypeScript analytical acceptance gate.
- No merge, deployment, destructive migration, production worker activation or external service purchase was performed.

### Product maturity boundaries
- Manufacturing DFM, process-plan validation, inspection acceptance, BOM generation and readiness assessment remain pilot/advisory capabilities. Economics and release evaluation remain experimental; CAM reports unavailable without a real toolpath runtime. Machine matching, quality nonconformance, ERP/MES and maintenance analytics remain research-only.
- The OpenFOAM worker supports one bounded laminar plane-Poiseuille benchmark only. Turbulence, multiphase flow, heat transfer, arbitrary dictionaries, general-purpose CFD and production certification are not supported.
- Broad multi-CAD interoperability, scan-to-CAD, advanced robotics and electromechanical integration remain separate roadmap increments.
- Current real-world economic outcomes remain **NOT MEASURED** until matched user trials are collected.

Update this section only when new evidence changes the recorded state. The Implementation Plan and Engineering Capabilities document remain authoritative for current product maturity.
