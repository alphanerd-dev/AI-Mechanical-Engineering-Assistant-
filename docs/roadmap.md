# Roadmap

## Product architecture
- General-purpose engineering platform; Mechanical Engineering is the initial domain, not the permanent product boundary.
- User/project context must remain separate from the reusable Engineering Core.
- AI models orchestrate engineering capabilities; deterministic providers perform calculations, simulation, CAD, and other technical operations.
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
- [ ] CI verification of the complete stack
- [ ] Production job queue + artifact handoff
- [ ] Pint integration
- [ ] SymPy integration
- [ ] NumPy/SciPy integration
- [ ] Dimensional-analysis validation
- [ ] Symbolic -> numerical computation pipeline
- [ ] Calculation cross-validation
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
- [ ] Structured engineering requirements
- [ ] Unit-aware constraint model
- [ ] Requirement -> calculation/CAD/test traceability
- [ ] SysML/MBSE provider boundary
- [ ] Constraint solving/optimization provider

## V1.9 — Manufacturing engineering
- [ ] DFM capability layer
- [ ] Tolerance-stack capability
- [ ] Manufacturing process planning boundary
- [ ] CAM/slicing provider boundary
- [ ] BOM and manufacturing evidence linkage

## V1.10 — Dynamics, robotics & digital engineering
- [ ] Multibody dynamics provider
- [ ] CAD -> URDF/MJCF/USD capability boundary
- [ ] Robotics asset validation
- [ ] Simulation-to-simulation comparison
- [ ] Digital-thread foundations

## V1.11 — PLM/PDM
- [ ] OdooPLM provider
- [ ] Revision/change workflows
- [ ] Engineering change impact analysis

## V1.12 — Integrated engineering orchestrator
- [ ] Requirement gates
- [ ] Research -> computation -> analysis -> CAD progression
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
