# Roadmap

## Product architecture
- General-purpose engineering platform; Mechanical Engineering is the initial domain, not the permanent product boundary.
- User/project context must remain separate from the reusable Engineering Core.
- AI models orchestrate engineering capabilities; deterministic providers perform calculations, simulation, CAD, manufacturing, and other technical operations.
- Critical results require explicit validation/evidence before being treated as verified.

## V1.0 — Foundation (retrospective)
- [x] Repository/package baseline
- [x] Initial provider-neutral engineering architecture
- [x] Initial project-state, memory, capability-routing, and test foundations
- [x] Initial CI/repository documentation baseline

Notes:
- V1.0 is reconstructed from the repository's initial implementation history; it was not previously recorded as a named roadmap milestone.
- This retrospective milestone establishes the starting point for the V1.1 core and avoids an undocumented gap at the beginning of the roadmap.

## V1.1 — Engineering core + mock providers
- [x] Core types
- [x] Project state
- [x] Engineering memory
- [x] Capability registry/router
- [x] Mock CAD provider
- [x] Basic engineering benchmark

## V1.2 — Numerical analysis provider
- [x] Shaft torque calculation
- [x] Preliminary shaft sizing
- [x] Numerical provider boundary
- [x] Engineering-result validation

## V1.3 — CAD kernel & multi-CAD architecture
- [x] Provider-independent CAD capability model
- [x] build123d/CadQuery code-generation boundary
- [x] OCCT validation/export boundary
- [x] Onshape provider adapters
- [x] FEA provider boundary
- [x] PLM provider boundary
- [x] Artifact/evidence model
- [x] Next.js + React + TypeScript workspace shell
- [x] Server-side Engineering Core API boundary

## V1.4 — Engineering computation & execution
- [x] Execution job contract
- [x] Unit-aware TypeScript execution boundary
- [x] Server-side execution API boundary
- [x] Controlled Python numerical worker
- [x] Worker allowlist and timeout policy
- [x] Container hardening baseline
- [x] General engineering domain/provider types
- [x] Computation capability contracts
- [x] Computation provenance model
- [x] CI verification of the complete stack
- [x] Production job queue contract + reference in-memory queue
- [x] Artifact handoff contract + fail-closed provenance checks
- [x] Pint integration
- [x] SymPy integration
- [x] NumPy/SciPy integration
- [x] Dimensional-analysis validation
- [x] Symbolic -> numerical computation pipeline
- [x] Calculation cross-validation
- [ ] Wolfram provider boundary
- [ ] SageMath provider boundary

## V1.5 — Research intelligence
- [x] Provider-independent research contracts
- [x] Source provenance model
- [x] Source authority ranking
- [x] Research finding extraction contract
- [x] Requirement linkage fields
- [x] Engineering-memory evidence boundary
- [x] Mock research provider and tests
- [x] Academic MCP/provider
- [ ] Manufacturer/component database provider
- [x] Controlled web retrieval provider
- [x] Research result -> verified project memory ingestion
- [x] Evidence-backed research verification API/UI

## V1.6 — Simulation
- [x] Static structural capability contract
- [x] PyMechanical execution-provider boundary
- [x] FEA model/result types
- [x] Simulation validation gates
- [x] Simulation acceptance gate (FoS + optional mesh convergence)
- [x] FEA artifact/evidence contracts
- [x] Simulation evidence -> EngineeringMemory/ProjectState bridge
- [ ] Real isolated PyMechanical worker runtime
- [ ] Persistent artifact storage
- [ ] Mesh convergence evidence from real multi-mesh solves
- [x] Open CalculiX/Gmsh provider foundation

## V1.7 — CAD execution
- [x] CAD worker execution contract and safety boundary
- [x] CAD geometry acceptance gate
- [x] CAD worker provider + capability routing
- [x] build123d worker protocol + transport adapter
- [x] CAD artifact manifest normalization
- [x] bounded CAD execution/validation correction loop
- [x] provisioned build123d runtime image
- [ ] CadQuery runtime
- [ ] OCCT/FreeCAD geometry validation runtime
- [ ] CAD code critique/self-correction loop
- [x] STEP/STL/3MF artifact pipeline

## V1.8 — Requirements, constraints & MBSE
- [x] Structured engineering requirements
- [x] Unit-aware constraint model
- [x] Requirement -> calculation/CAD/test traceability
- [x] SysML/MBSE provider boundary
- [x] Constraint solving/optimization provider

## V1.9 — Engineering verification & evidence integrity
- [x] Requirement-level verification engine
- [x] Reusable verification plans
- [x] Evidence gates by engineering method
- [x] Dependency-aware verification
- [x] Requirement traceability cycle protection
- [x] Explicit human approval gate
- [x] Evidence artifact provenance validation
- [x] CAD/FEA evidence integration into project verification

## V1.10 — Manufacturing engineering
- [x] Manufacturing process-plan boundary
- [x] Process sequencing and predecessor validation
- [x] Manufacturing inspection acceptance
- [x] Manufacturing artifact/evidence linkage
- [x] Manufacturing capability-provider boundary
- [x] Routed manufacturing capabilities
- [ ] DFM rule library (superseded/fulfilled in measured form by V1.19 and V1.21)
- [ ] Tolerance-stack capability (fulfilled by V1.20)
- [ ] CAM/slicing provider boundary (fulfilled by V1.21)
- [ ] BOM generation and manufacturing release workflow (fulfilled by V1.21)

## V1.11 — Dynamics, robotics & digital engineering
- [x] Multibody dynamics provider
- [x] CAD -> URDF/MJCF/USD capability boundary
- [x] Robotics asset validation
- [x] Simulation-to-simulation comparison
- [x] Digital-thread foundations

Notes:
- V1.11 provides provider contracts and deterministic validation boundaries.
- Solver runtimes, CAD-to-robotics converters, persistent digital-thread storage, and production robotics/simulation backends remain provider/runtime work beyond this milestone.

## V1.12 — PLM/PDM
- [x] OdooPLM provider boundary
- [x] Revision/change workflow guards
- [x] Engineering change impact analysis

Notes:
- The OdooPLM adapter normalizes PLM items and revisions behind an explicit client boundary.
- Live Odoo credentials, transport, and durable server-side persistence remain integration/runtime work.
- Revision application is fail-closed: a revision must pass validation and approval before it can be marked applied.

## V1.13 — Integrated engineering orchestrator
- [x] Requirement gates
- [x] Research -> computation -> analysis -> CAD -> manufacturing progression
- [x] Failure/rework loop
- [x] Traceability graph
- [x] Human approval gates
- [x] Cross-domain capability routing

Notes:
- V1.13 is the workflow-control foundation: capabilities remain deterministic/provider-owned while the orchestrator controls order, prerequisites, approvals, bounded retries, evidence acceptance, and requirement-to-artifact traceability.
- It does not claim autonomous engineering judgment; unsafe or unverified results remain blocked or explicitly unverified.

## V1.14 — Execution reliability & artifact handoff
- [x] Bounded execution queue with configurable concurrency
- [x] Duplicate-job protection
- [x] Artifact handoff contract
- [x] Provenance-preserving handoff store
- [x] Fail-closed artifact acceptance rules

## V1.15 — Engineering Workspace persistence foundations
- [x] Versioned workspace snapshot contract
- [x] Optimistic project-revision protection
- [x] Provider-neutral project state store interface
- [x] Immutable in-memory reference store
- [x] JSON snapshot serialization/deserialization
- [x] Fail-closed snapshot schema/date/revision validation

## V1.16 — Engineering artifact registry persistence foundations
- [x] Provider-neutral artifact record contract
- [x] Project-scoped artifact registry
- [x] Immutable artifact metadata snapshots
- [x] Optimistic artifact-revision protection
- [x] Fail-closed artifact record validation
- [x] Reference in-memory artifact store

## V1.17 — Provisioned build123d execution path
- [x] Explicit CAD artifact manifest contract
- [x] Artifact path confinement and existence checks
- [x] Pinned build123d 0.13.0 reference runtime image
- [x] Non-root CAD runtime container
- [x] Runtime smoke test producing BREP/STEP/STL/3MF
- [x] CI verification of the provisioned CAD runtime

## V1.18 — Open FEA execution
- [x] Provider-neutral Gmsh mesh contract
- [x] Provider-neutral CalculiX static-structural contract
- [x] Fail-closed FEA execution validation
- [x] FEA artifact/evidence bridge
- [x] Pinned Gmsh 4.15.2 + CalculiX 2.20 reference runtime
- [x] Deterministic Gmsh -> CalculiX smoke benchmark
- [x] CI verification of the real open FEA toolchain
- [ ] Generic CAD artifact -> Gmsh mesh ingestion
- [ ] Real multi-mesh convergence evidence
- [ ] PyVista/native result post-processing
- [ ] Production FEA worker transport

Notes:
- V1.18 proves the open solver path without treating solver convergence as design safety.
- The deterministic benchmark is a runtime/CI gate, not a generic engineering verdict.
- The open provider is preferred before the Ansys provider in capability routing for the baseline static-structural capability.

## V1.19 — CAD validation / regression / diff
- [x] Geometry regression metrics
- [x] CAD artifact diffing
- [x] Wall-thickness validation
- [x] DFM geometry checks
- [x] Automated CAD judging/compare loop

Notes:
- V1.19 adds a deterministic geometry-analysis layer over measured CAD snapshots.
- Missing geometry measurements are reported as INCOMPLETE; the system never invents a metric.
- Regression tolerances, wall-thickness limits, and DFM rules are explicit inputs.
- CAD judging is deterministic and criteria-driven; it does not substitute for engineering verification or human design approval.
- Actual measurement runtimes remain provider-owned (for example OCCT/FreeCAD/CADGate-style services).

## V1.20 — Constraint solving + tolerance
- [x] Unit-aware constraint solver integration
- [x] Tolerance stack engine
- [x] ISO fits/callout support
- [x] Constraint-backed design-space exploration

Notes:
- V1.20 adds a provider-neutral deterministic constraint/tolerance layer.
- Constraint solving currently supports fully determined linear equality systems with explicit units, finite bounds, and explicit inequality checks.
- Design-space exploration is deterministic bounded grid enumeration with an explicit sample ceiling; hitting the ceiling returns INCOMPLETE.
- Worst-case tolerance stacking performs explicit unit conversion and supports signed/coefficient contributors.
- RSS requires explicit one-sigma inputs and does not infer statistical distributions from tolerance limits.
- ISO 286 fit designations are recorded only when explicit deviations are supplied; authoritative fit-table lookup remains a future standards-backed provider.
- Constraint satisfaction and numerical solve success do not constitute engineering safety or design approval.

## V1.21 — DFM + manufacturing intelligence
- [x] Measured DFM provider
- [x] CAM/slicing boundary
- [x] Manufacturing cost/time/material estimates
- [x] BOM generation and release workflow

Notes:
- V1.21 adds a manufacturing-domain intelligence layer over the measured CAD/DFM and manufacturing-process foundations.
- DFM evaluation consumes explicit measured geometry metrics and explicit process rules; no default manufacturability limits are invented.
- Manufacturing economics are deterministic estimates based only on explicit material quantities, scrap, operation times, machine rates, labor rates, and currency labels.
- BOM generation aggregates identical part/revision lines deterministically and requires structurally valid identity, quantity, and unit data.
- Release preparation is fail-closed: structural readiness can produce READY, but RELEASED requires an explicit human approval record.
- CAM/slicing is a provider boundary only; the unconfigured boundary reports UNAVAILABLE and never claims a toolpath or slice artifact.

## V1.22 — Stronger digital thread / product model
- [x] Product model object graph
- [x] Cross-record referential integrity
- [x] Persistent engineering decision records
- [x] Expanded requirement/artifact/revision lineage

Notes:
- V1.22 adds a provider-neutral project-scoped product model over the existing requirements, artifacts, revisions, manufacturing, evidence, and change objects.
- Typed links require both endpoints to be registered and to belong to the same project; self-links and duplicate link ids are rejected.
- Engineering decisions are versioned records with optimistic revision advancement and explicit approval metadata when marked APPROVED.
- Product-model snapshots are validated for duplicate nodes, unregistered references, project-boundary violations, timestamps, and approved-decision metadata.
- The persistence layer remains an in-memory reference implementation; durable database persistence and multi-user conflict resolution remain future workspace work.

## V1.23 — Dynamics / Chrono / Pinocchio
- [x] Chrono provider
- [x] Pinocchio provider
- [x] CAD -> robotics asset runtime integration
- [x] Cross-solver dynamics validation

Notes:
- V1.23 adds provider boundaries for Project Chrono multibody simulation and Pinocchio inverse rigid-body dynamics.
- Chrono and Pinocchio are deliberately separate capabilities because their numerical roles differ; Pinocchio is not treated as a generic time-integration simulator.
- Cross-solver comparison requires explicit numeric criteria and explicit absolute and/or relative tolerances. Matching summary values does not imply trajectory equivalence.
- CAD-derived robotics assets must preserve source CAD lineage and pass the existing robotics topology validation before runtime loading.
- The default application entrypoint contains fail-closed runtime stubs; no solver result or runtime handle is claimed without a configured executor.

## V1.24 — System simulation / OpenModelica
- [x] OpenModelica provider
- [x] Parameter sweep capability
- [x] Sensitivity analysis
- [x] Co-simulation boundary

Notes:
- V1.24 adds a provider-neutral Modelica system-simulation contract with an explicit OpenModelica provider boundary.
- System simulations require explicit model source/URI, parameters, time bounds, and step size; completion requires the provider to report a completed converged result.
- Parameter sweeps are deterministic bounded grids with an explicit sample ceiling and an explicit objective when ranking is requested.
- Sensitivity uses central finite differences from explicit lower/base/upper simulations; no sensitivity coefficient is inferred from missing runs or unspecified perturbations.
- Co-simulation requires at least two validated Modelica participants and explicitly aligned participant steps.
- The default application entrypoint uses fail-closed OpenModelica stubs; no system simulation, sweep, sensitivity result, or co-simulation completion is claimed without a configured executor.

## V2.0 — Bounded autonomous engineering workspace
- [x] V2.0.1 workspace + task graph foundation
- [x] V2.0.2 task graph execution-control bridge
- [x] V2.0.3 project memory persistence foundation
- [x] V2.0.4 multi-agent specialist delegation
- [x] V2.0.5 bounded autonomous execution + AgentRuntime boundary
- [x] V2.0.6 identity + authorization boundary
- [x] V2.0.7 engineering audit trail primitive
- [x] V2.0 benchmark suite
- [x] V2.0.8 production authentication + Supabase Auth
- [x] V2.0.9 collaborative engineering state foundation
- [x] V2.0.10 first end-to-end Engineering Completion Unit
- [x] V2.0.11 risk-adaptive engineering experience
- [x] V2.0.12 context-aware engineering interaction
- [x] V2.0.13 evidence-as-a-byproduct
- [x] V2.0 final product/workflow gate
- [x] V2.0.14 AI-native completion entry
- [x] V2.0.15 AI-native completion path validation
- [ ] V2.0.16 model-backed intent adapter
- [ ] V2.0.17 real engineering interaction surface
- [ ] Domain expansion beyond Mechanical Engineering

Notes:
- V2.0.6 establishes provider-neutral identity and authorization with explicit roles, permissions, deny-by-default decisions, and optional project scoping.
- V2.0.7 establishes an append-only audit boundary with sequenced events, actor/resource context, outcomes, and tamper-evident hash-chain verification.
- The V2.0 benchmark suite is a regression/conformance gate, not an engineering safety verdict.
- V2.0.8 binds the application authentication boundary to Supabase Auth with SSR session handling, server-side claims verification, server-controlled app_metadata roles, route-level authorization, and fail-closed identity mapping.
- V2.0.9 adds durable project, project-membership, and workspace-snapshot foundations with database-enforced project isolation and RLS. Realtime presence, chat/comments, social collaboration, and full durable task/artifact/evidence/audit stores remain deferred.
- V2.0.9 collaboration contracts remain provider-neutral; the Supabase schema is the production persistence boundary while the application core does not hard-depend on Supabase.
- V2.0.10 demonstrates the first Engineering Completion Unit: explicit shaft requirements → task graph → deterministic torque/sizing → validation → evidence → authorized approval → final verification → project completion.
- V2.0.11 makes risk-adaptive interaction a deterministic experience policy: fast exploration by default, automatic rigor for consequential engineering work, and explicit control points when ambiguity, consequence, verification intent, or risk warrants them.
- V2.0.12 adds context resolution before questioning: known project inputs can satisfy material questions automatically, while unknown values remain unknown and are never invented.
- V2.0.13 adds a provider-neutral evidence-by-product primitive. Validated deterministic execution can automatically emit VERIFIED evidence with checked artifact and requirement provenance; failed or incomplete validation emits no VERIFIED evidence. The canonical shaft completion workflow now records those evidence IDs directly in project state before approval. Human approval evidence remains explicitly separate.
- V2.0.10 intentionally leaves detailed shaft design domains such as fatigue, keys/couplings, bearings, critical speed, deflection, detailed CAD, manufacturing release, and standards-backed material selection outside the unit.
- V2.0 final product/workflow gate confirms the canonical Engineering Completion Unit as the product contract: explicit requirements → deterministic task execution → validation → automatic evidence → explicit authorized approval when required → final verification → traceable completion. The gate also requires artifact/evidence lineage consistency and fail-closed behavior on validation failure.
- V2.0.14 makes the canonical Engineering Completion Unit reachable from natural engineering intent. The entry path interprets intent, resolves known context, applies risk-adaptive rigor, invokes the existing deterministic completion unit, and returns a concise decision-ready result or the minimum required escalation.
- V2.0.15 is the named product acceptance gate for the AI-native path. It validates intent routing, context reuse, minimal escalation, fail-closed validation, decision-ready output, multi-turn continuation, and wrong-unit protection. The gate also locks the invariant that AI-native entry must route through the existing deterministic completion capability rather than create a second engineering execution path.
- V2.0.15 uses a provider-neutral project-scoped in-memory intent session contract for continuation. Session state reduces repeated input but is not authorization, engineering truth, or durable project memory.
- V2.0.15 keeps the deterministic reference interpreter as a replaceable test harness. It does not claim that regex extraction is production AI intelligence.
- V2.0.16 should add the model-backed intent adapter only after V2.0.15's seven-case acceptance gate is green.
- V2.0.15 acceptance is complete: the seven-case AI-native path gate, decision-ready result contract, continuation behavior, wrong-unit protection, fail-closed validation, and single deterministic execution-path invariant are implemented and regression-tested.
- Product/UX work must obey the peer principles: "AI proposes. Deterministic systems execute. Validation decides. Evidence proves." and "Fast by default. Rigorous when it matters. Explicit when risk increases."

## V2.1 — Multi-CAD Engineering Layer
- [ ] Provider-neutral CAD document/model identity
- [ ] Multi-CAD capability routing
- [ ] CAD artifact provenance and validation integration
- [ ] First reference CAD provider

