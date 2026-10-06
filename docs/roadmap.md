# Roadmap

## Product architecture
- General-purpose engineering platform; Mechanical Engineering is the initial domain, not the permanent product boundary.
- User/project context must remain separate from the reusable Engineering Core.
- AI models orchestrate engineering capabilities; deterministic providers perform calculations, simulation, CAD, manufacturing, and other technical operations.
- Critical results require explicit validation/evidence before being treated as verified.

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
- [ ] DFM rule library
- [ ] Tolerance-stack capability
- [ ] CAM/slicing provider boundary
- [ ] BOM generation and manufacturing release workflow

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
- [ ] Chrono provider
- [ ] Pinocchio provider
- [ ] CAD -> robotics asset runtime integration
- [ ] Cross-solver dynamics validation

## V1.24 — System simulation / OpenModelica
- [ ] OpenModelica provider
- [ ] Parameter sweep capability
- [ ] Sensitivity analysis
- [ ] Co-simulation boundary

## V2.0 — Bounded autonomous engineering workspace
- [ ] Project memory persistence
- [ ] Multi-agent specialist delegation
- [ ] Bounded autonomous execution
- [ ] Production authentication and authorization
- [ ] Full audit trail
- [ ] Benchmark suite
- [ ] Multi-user collaboration
- [ ] Domain expansion beyond Mechanical Engineering
