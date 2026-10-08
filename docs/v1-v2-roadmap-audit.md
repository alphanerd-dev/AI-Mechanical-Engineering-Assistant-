# V1.0 -> V2.0.15 Roadmap Audit

Audit date: 2026-10-08
Repository baseline: `main` at merge commit `382366d6e36bf30f4288fedc8657cbc01f7eda63`

## Audit rule

A roadmap item is not considered complete merely because a type, interface, or stub exists. The audit uses these categories:

- **COMPLETE** — intended capability is implemented within its declared scope, routed, validated where applicable, and covered by tests or a real CI/runtime gate.
- **FOUNDATION** — the provider-neutral contract and deterministic boundary are real, but the production runtime or durable infrastructure is intentionally outside the milestone.
- **PARTIAL** — meaningful implementation exists, but an item claimed by the roadmap still has a material capability gap.
- **SUPERSEDED** — the original wording was later fulfilled by a newer milestone and should not remain an apparent backlog item.
- **DEFERRED** — intentionally postponed because it is an external/runtime/integration dependency or belongs to a later product layer.
- **GAP** — roadmap/product language is materially ahead of the implementation or the roadmap itself is stale/inconsistent.

## Milestone assessment

| Milestone | Audit status | Evidence / finding | Action |
|---|---|---|---|
| V1.0 | **GAP, now corrected** | No V1.0 milestone was recorded even though repository/package, architecture, roadmap, core, and initial tests were established in the earliest commits. | Added retrospective V1.0 foundation entry. |
| V1.1 | **COMPLETE** | Core types, project state, memory, capability registry/router, mock CAD, and initial benchmark are exercised by the original engineering-core tests. | No reopening. |
| V1.2 | **COMPLETE** | Shaft torque, preliminary shaft sizing, numerical provider routing, and engineering-result validation are implemented and tested. | No reopening. |
| V1.3 | **FOUNDATION COMPLETE** | CAD, Onshape, OCCT, FEA, PLM, artifact/evidence, workspace, and server API boundaries exist. The milestone is architectural; it does not claim every real runtime. | Keep as foundation; real runtimes belong to later milestones. |
| V1.4 | **COMPLETE within scope; external providers deferred** | Execution contracts, controlled Python worker, allowlists, hardening, Pint/SymPy/NumPy/SciPy, dimensional analysis, symbolic/numerical flow, provenance, cross-validation, and CI verification exist. | Keep Wolfram and SageMath explicitly deferred. |
| V1.5 | **COMPLETE within scope; database provider deferred** | Research contracts, provenance, source ranking, extraction, requirement linkage, verification gate, academic/web providers, and verified-memory ingestion are tested. | Keep manufacturer/component database provider deferred. |
| V1.6 | **FOUNDATION / PARTIAL runtime layer** | PyMechanical provider and worker boundaries plus simulation validation/evidence exist. The open CalculiX/Gmsh path was later added and has a real CI smoke benchmark. | Do not block V2.0.16 on Ansys runtime; keep real PyMechanical, persistent artifacts, and multi-mesh convergence as explicit runtime work. |
| V1.7 | **COMPLETE for provisioned build123d path; other runtimes deferred** | CAD execution safety, routing, build123d protocol/transport, artifact normalization, bounded correction, pinned runtime, and STEP/STL/3MF CI gates exist. | Keep CadQuery and OCCT/FreeCAD runtime work deferred; treat self-correction as bounded orchestration, not autonomous engineering judgment. |
| V1.8 | **COMPLETE foundation** | Structured requirements, unit-aware constraints, requirement traceability, SysML/MBSE boundary, and constraint-solving provider are implemented. | No reopening. |
| V1.9 | **COMPLETE** | Requirement verification, reusable plans, evidence gates, dependency checks, cycle protection, approval, provenance validation, and CAD/FEA evidence integration are covered by verification tests. | No reopening. |
| V1.10 | **SUPERSEDED by later milestones** | DFM/tolerance/CAM/BOM work was intentionally left open here and later fulfilled in V1.19/V1.20/V1.21 at a more precise capability boundary. | Roadmap now identifies these as fulfilled later rather than pretending they are current blockers. |
| V1.11 | **FOUNDATION COMPLETE** | Dynamics, robotics conversion/validation, simulation comparison, and digital-thread contracts are tested behind providers. Notes explicitly defer production runtimes and durable storage. | No reopening before V2.0.16. |
| V1.12 | **FOUNDATION COMPLETE** | OdooPLM normalization, revision guards, approval gating, and change-impact analysis are tested. Live credentials/transport/persistence remain deferred by design. | No reopening before V2.0.16. |
| V1.13 | **COMPLETE workflow-control foundation** | Requirement gates, dependency order, bounded rework, evidence gates, traceability, approval, and cross-domain routing are tested. It explicitly does not claim autonomous engineering judgment. | No reopening. |
| V1.14 | **COMPLETE reference reliability layer** | Bounded queue, concurrency, duplicate protection, artifact handoff, and provenance preservation are tested. | Durable production queue remains infrastructure work, not a V1 correctness gap. |
| V1.15 | **FOUNDATION COMPLETE** | Versioned snapshots, optimistic revision protection, JSON serialization, validation, and isolated in-memory storage are tested. | Durable persistence remains later workspace work. |
| V1.16 | **FOUNDATION COMPLETE** | Project-scoped artifact records, immutability, revisions, validation, and in-memory storage are tested. | Durable artifact registry remains later workspace work. |
| V1.17 | **COMPLETE** | Pinned build123d 0.13.0 image, non-root runtime, path controls, artifact formats, and CI smoke verification are present. | No reopening. |
| V1.18 | **PARTIAL / intentionally bounded** | Real Gmsh + CalculiX runtime and CI smoke benchmark exist. Missing items are generic CAD-to-Gmsh ingestion, real multi-mesh convergence, native post-processing, and production worker transport. | Treat as explicit CAE follow-up, not a V2.0.16 blocker. |
| V1.19 | **COMPLETE deterministic analysis layer** | Geometry regression, diff, wall-thickness, DFM, and deterministic judging are implemented and tested over measured snapshots. | Keep actual measurement runtime as provider work. |
| V1.20 | **COMPLETE bounded deterministic layer** | Constraint solving, bounded design-space exploration, worst-case/RSS tolerance, and ISO callout handling are implemented with fail-closed rules. | Keep authoritative standards-table lookup deferred. |
| V1.21 | **COMPLETE intelligence layer; CAM boundary only** | DFM evaluation, manufacturing economics, BOM, release guards, and routed manufacturing capabilities are tested. CAM intentionally reports unavailable without a configured runtime. | Do not turn the boundary into a fake toolpath generator. |
| V1.22 | **FOUNDATION COMPLETE** | Product graph, referential integrity, project scoping, versioned decisions, lineage, and validation exist. Persistence is still in-memory by declared scope. | Durable product-model storage remains workspace infrastructure work. |
| V1.23 | **FOUNDATION COMPLETE** | Chrono, Pinocchio, cross-solver comparison, CAD-to-robotics lineage, and runtime loading contracts are tested. Default entrypoint remains fail-closed without executors. | Keep production solver runtimes deferred. |
| V1.24 | **FOUNDATION COMPLETE** | OpenModelica contract, deterministic sweeps, finite-difference sensitivity, and co-simulation boundaries are tested. Default entrypoint is fail-closed without an executor. | Keep production Modelica runtime integration deferred. |
| V2.0.1–V2.0.14 | **COMPLETE** | Workspace/task graph, execution bridge, memory foundation, specialist delegation, bounded autonomy, auth, audit, benchmark, Supabase Auth, collaboration foundation, completion unit, risk/context/evidence gates, and AI-native entry are implemented and merged. | No reopening based on “could be bigger.” |
| V2.0.15 | **COMPLETE; roadmap was stale** | The seven-case AI-native path gate is implemented, regression-tested, and merged. The roadmap checkbox was still unchecked. | Corrected the roadmap to [x]. |
| V2.0.16 | **NOT STARTED** | Model-backed intent adapter remains the next intended milestone after the acceptance gate. | Do not implement until this audit correction is merged. |

## Genuine gaps versus deferred work

### Genuine gaps that should be closed before treating the roadmap as trustworthy

1. **Missing V1.0 record.** The starting foundation was real but undocumented.
2. **Stale V2.0.15 status.** The implementation is merged and verified, but the roadmap still showed it as open.
3. **Roadmap ambiguity around V1.10.** Several items were later implemented in V1.19–V1.21 but remained visually open, making the roadmap look less complete than the repository actually is.
4. **Milestone language must distinguish capability boundary from production runtime.** V1.3/V1.6/V1.7/V1.11–V1.24 deliberately contain provider/runtime boundaries and fail-closed stubs. Treating those as production solver deployments would violate the evidence-first architecture.

### Important engineering gaps that are real but should not block V2.0.16

- Real OCCT/FreeCAD/CADGate-style geometry measurement runtime.
- Generic CAD artifact -> Gmsh ingestion.
- Real multi-mesh convergence evidence.
- Production FEA worker transport and durable artifact storage.
- Production PyMechanical runtime.
- CadQuery runtime.
- Authoritative ISO fit-table lookup.
- Production CAM/slicing.
- Durable product-model and artifact/evidence/task/audit application stores beyond the current Supabase collaboration foundation.
- Production Chrono/Pinocchio/OpenModelica executors.
- Manufacturer/component database, Wolfram, and SageMath integrations.

These are substantive roadmap capabilities, but they are not evidence that the current V2.0 deterministic completion product is architecturally unsound.

## Decision-framework conclusion

**First principles:** the product promise is an evidence-driven engineering workspace, not “every engineering solver must already be live.”

**5 Whys:** the real reason to audit now is to prevent the model-backed layer from hiding infrastructure weaknesses. The audit does that without forcing unrelated runtime integrations into V2.0.16.

**Inversion:** the failure mode to avoid is a roadmap that says “complete” while important providers are only stubs, or a roadmap that says “incomplete” for work already delivered. The corrected audit makes both visible.

**Opportunity cost:** implementing every remaining V1 runtime before model-backed intent would delay the product's AI-native path without improving the canonical shaft completion contract.

**Second-order effect:** keeping provider/runtime work explicit makes future model adapters easier to trust because the adapter can never silently become the engineering authority.

**Regret minimization:** the low-regret move is to close the documentation/status inconsistencies now, keep runtime gaps explicit, and only then start V2.0.16.

## Exit condition for this audit

The V1.0 -> V2.0.15 roadmap is considered audit-complete when:

- the starting V1.0 foundation is recorded;
- every V1 item is classified as complete, foundation, superseded, partial, or deferred;
- V2.0.15 is marked complete;
- deferred runtime gaps are explicitly named rather than hidden;
- no deferred item is incorrectly treated as a V2.0.16 blocker.

That condition is satisfied by the roadmap correction in this branch.

## Recommended sequence after this audit

**Now:** merge this roadmap/audit correction through the normal PR CI gate.

**Next:** begin V2.0.16 model-backed intent adapter using a structured `EngineeringIntent` output contract. The model proposes intent; the existing deterministic core remains authoritative.

**Then:** V2.0.17 real engineering interaction surface, followed by the highest-value real runtime gap based on actual workflow demand rather than the numerical order of old V1 items.
