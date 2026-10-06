# Roadmap

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

## V1.4 — Engineering execution layer
- [x] Execution job contract
- [x] Unit-aware TypeScript execution boundary
- [x] Server-side execution API boundary
- [x] Controlled Python numerical worker
- [x] Worker allowlist and timeout policy
- [x] Container hardening baseline
- [ ] CI verification of the complete stack
- [ ] Production job queue + artifact handoff
- [ ] SymPy/SciPy/Pint worker integration
- [ ] Wolfram provider boundary

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

## V1.7 — CAD execution
- [x] CAD worker execution contract and safety boundary
- [x] CAD geometry acceptance gate
- [x] CAD worker provider + capability routing
- [x] build123d worker protocol + transport adapter
- [ ] provisioned build123d runtime image
- [ ] CadQuery runtime
- [ ] OCCT/FreeCAD geometry validation runtime
- [ ] CAD code critique/self-correction loop
- [ ] STEP/STL/3MF artifact pipeline

## V1.8 — PLM/PDM
- [ ] OdooPLM provider
- [ ] Revision/change workflows
- [ ] Engineering change impact analysis

## V1.9 — Integrated engineering orchestrator
- [ ] Requirement gates
- [ ] Research -> analysis -> CAD progression
- [ ] Failure/rework loop
- [ ] Traceability graph
- [ ] Human approval gates

## V2.0 — Bounded autonomous engineering workspace
- [ ] Project memory persistence
- [ ] Multi-agent specialist delegation
- [ ] Bounded autonomous execution
- [ ] Production authentication and authorization
- [ ] Full audit trail
- [ ] Benchmark suite
