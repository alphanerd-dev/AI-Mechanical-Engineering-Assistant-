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
- [ ] Production job queue + artifact handoff
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
- [ ] Open CalculiX/Gmsh provider

## V1.7 — CAD execution
- [x] CAD worker execution contract and safety boundary
- [x] CAD geometry acceptance gate
- [x] CAD worker provider + capability routing
- [x] build123d worker protocol + transport adapter
- [x] CAD artifact manifest normalization
- [x] bounded CAD execution/validation correction loop
- [ ] provisioned build123d runtime image
- [ ] CadQuery runtime
- [ ] OCCT/FreeCAD geometry validation runtime
- [ ] CAD code critique/self-correction loop
- [ ] STEP/STL/3MF artifact pipeline

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
- [ ] OdooPLM provider
- [ ] Revision/change workflows
- [ ] Engineering change impact analysis

## V1.13 — Integrated engineering orchestrator
- [ ] Requirement gates
- [ ] Research -> computation -> analysis -> CAD -> manufacturing progression
- [ ] Failure/rework loop
- [ ] Traceability graph
- [ ] Human approval gates
- [ ] Cross-domain capability routing

## V2.0 — Bounded autonomous engineering workspace
- [ ] Project memory persistence
- [ ] Multi-agent specialist delegation
- [ ] Bounded autonomous execution
- [ ] Production authentication and authorization
- [ ] Full audit trail
- [ ] Benchmark suite
- [ ] Multi-user collaboration
- [ ] Domain expansion beyond Mechanical Engineering
