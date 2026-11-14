# ADR — Proprietary geometry platform and progressive kernel ownership

- **Status:** Accepted — strategic architecture direction; implementation remains phased and gated.
- **Decision date:** 8 November 2026
- **Supersedes:** The “do not start a proprietary geometry-kernel programme” decision in [ADR — OCCT-first hybrid geometry foundation](adr-2026-11-08-hybrid-geometry-foundation.md). The OCCT-first adapter decision remains valid.
- **Scope:** Product-owned geometry architecture, CAD-domain contracts, kernel adapters and progressive development of native geometric algorithms.

## Context

The repository already has a bounded CAD path: typed intent, deterministic build123d generation, isolated worker execution, artifact registration and independent OpenCascade BREP validation. It also has CAD-specific identity, provenance, artifact-manifest, viewer-registry and execution modules. These existing contracts must be audited and evolved; a parallel artifact registry or competing CAD pipeline is not acceptable.

The product's long-term ambition is broader than consuming a third-party kernel. It should own a reusable engineering geometry platform whose APIs, identity model, feature semantics, constraints, provenance, validation relationships and engineering-specific algorithms can serve this assistant and future CAD, CAE, robotics and manufacturing products.

A complete general-purpose B-rep kernel is a large numerical software programme. Immediate from-scratch replacement would create avoidable correctness, interoperability and schedule risk. The platform and the underlying geometric algorithms therefore have separate ownership and maturity paths.

## Decision

Build a **proprietary engineering geometry platform now**, and pursue a **progressively independent geometry kernel** behind it.

1. **Own the platform boundary.** Product-owned contracts define engineering geometry identity, revisioning, units, coordinate frames, tolerances, feature/operation intent, constraints, provenance, artifact lineage and validation/evidence relationships.
2. **Keep the kernel replaceable.** Exact curves, surfaces, B-rep topology, Boolean operations and geometric algorithms are accessed through versioned kernel adapters. OCCT remains the initial mature provider and the existing independent BREP validator remains in place.
3. **Retain existing authoring providers.** Keep the bounded build123d generation workflow. Other authoring/import providers require named workflows, provider-specific acceptance and a clear user benefit.
4. **Establish revision identity before native algorithms.** After the G1 facade, G2 defines immutable geometry revisions, exact canonical artifact digests, lineage and concurrency. Only then begin deterministic mathematical primitives and measurements, robust predicates, topology utilities, bounded solid construction and selected advanced operations. Do not create unrevisioned geometry or claim native-kernel parity from a partial implementation.
5. **Promote by conformance, not ambition.** A native operation may replace an adapter operation only after it passes the same shared fixtures, negative cases, numerical/tolerance checks, regression corpus and performance/resource gates as the incumbent provider.
6. **Keep canonical geometry separate from display derivatives.** Tessellation and rendering remain downstream projections. Display meshes never become authoritative CAD geometry or engineering measurement sources.
7. **Preserve trust boundaries.** AI may propose typed geometry intent. Deterministic providers execute. Independent validators decide the declared checks. Evidence binds to exact bytes, inputs and runtime. Human approval remains separate.
8. **Do not force a premature language or runtime choice.** TypeScript remains suitable for orchestration and product contracts. Native geometry computation should use a systems language selected by measured interoperability, numerical-library availability, performance, portability and maintainability. C++ is the leading initial candidate because of the geometry ecosystem; Rust remains an option for suitable subsystems. The language decision requires a separate implementation ADR.
9. **Keep the first implementation in this repository.** Establish an independently testable module boundary inside the existing repository. Extract a separate repository only when APIs, release/versioning, CI, conformance tests and external consumers are independently sustainable.

## Ownership boundaries

| Concern | Owner | Initial implementation direction |
|---|---|---|
| Engineering geometry identity, revision and lineage | Product geometry platform | Evolve existing CAD/artifact contracts after audit |
| Units, frames, tolerances and typed operation requests | Product geometry platform | Versioned TypeScript contracts |
| Feature intent, dependency graph and parametric semantics | Product geometry platform | Product-owned deterministic model |
| Exact curves, surfaces, B-rep and mature Boolean operations | Kernel adapter | OCCT initially |
| Existing bounded CAD authoring | Authoring provider | build123d |
| Native mathematical primitives and selected algorithms | Native kernel | Incremental, independently tested implementation |
| Tessellation and display manifests | Geometry processing boundary | Worker/provider adapter |
| Rendering, camera and selection UI | Visualization subsystem | Renderer-neutral; Babylon.js/Three.js benchmark remains separate |
| Validation and evidence | Independent validators | Existing capability-specific validation/evidence contracts |
| Approval/release | Authorized human reviewer | Existing authorization boundary |

## Implementation phases and exit gates

### G0 — Repository and contract audit

Inventory existing CAD identity, provenance, artifact manifests, viewer registry, execution, provider, worker and validation contracts. Map duplicate concepts and current call paths. No new canonical identity or registry is created during this audit.

**Exit:** reviewed contract map, dependency map, capability matrix, test inventory and explicit gaps.

### G1 — Product-owned platform boundary

Refactor only where the audit demonstrates a boundary problem. Define stable, versioned geometry operation and provider contracts; preserve compatibility with existing persisted artifacts and workflows. Establish provider conformance fixtures and canonical/display derivative lineage.

**Exit:** existing cylindrical CAD path passes unchanged through the platform boundary; no regression in authorization, artifact persistence or independent OCCT validation.

### G2 — Geometry identity, immutable revisions and canonical representation

Define and persist immutable geometry revisions that reference exact canonical artifact bytes in the existing artifact registry. Keep logical CAD model identity, model metadata revision, geometry revision, source-code digest, canonical geometry digest, exchange derivatives and display derivatives distinct. Define project isolation, parent/head semantics, idempotency, optimistic concurrency, validation-receipt binding and a safe legacy-artifact migration policy.

The initial scope binds the existing G1 cylinder/shaft result to its canonical BREP artifact. It does not add native geometry algorithms or a second artifact store.

**Exit:** immutable revision contracts, exact output-byte digest verification, artifact/model/project binding, parent/sequence rules, idempotency, concurrency conflicts, validation separation, legacy migration and rollback tests pass. See [G2 Identity, Revision and Canonical Representation Design](../geometry-platform/g2-identity-revision-design.md).

### G3 — Native mathematical foundation

Implement and test dimensioned vectors, points, transforms, planes, lines, circles/arcs, bounding boxes, distances, projections and declared tolerance policies. Define coordinate-frame and unit semantics explicitly.

**Exit:** analytical reference fixtures, property-based tests, degeneracy tests and cross-checks against an independent reference implementation pass within declared tolerances.

### G4 — Native topology and bounded solid construction

Develop selected topology data structures and simple primitive/analytic solid construction. Preserve stable entity identity within a geometry revision; do not promise persistent face identity across arbitrary topology-changing operations.

**Exit:** topology invariants, volume/bounds/dimension checks, invalid-input handling and round-trip fixtures pass.

### G5 — Advanced operations

Evaluate native extrusion/revolution, intersections and Boolean operations, followed by fillet/chamfer/offset only where robust algorithms and user value justify the cost. Keep OCCT as fallback/provider until each operation independently qualifies.

**Exit:** adversarial and degenerate fixtures, robustness corpus, differential tests, resource limits and performance targets pass for each promoted operation.

### G6 — Parametric and constraint intelligence

Develop sketch constraints, feature dependency graphs, deterministic regeneration and incremental recomputation. Keep solver semantics and geometric kernel execution separate but composable.

**Exit:** deterministic regeneration, under-/over-constrained cases, cycle detection, version migration and edit-history regression pass.

### G7 — Independent productization

Support native and worker/WASM execution only where each runtime has separate acceptance. Consider extracting a standalone repository only after independent versioning, CI, documentation, licensing, security and at least one real external consumer are established.

**Exit:** published API stability policy, conformance suite, supported-runtime matrix, release process and operational ownership.

## Non-goals for the first increment

- Replacing OCCT or build123d immediately.
- Claiming a complete Parasolid/ACIS/CGM-class general-purpose kernel.
- Building a new CAD user interface before the geometry contracts and viewer roadmap require it.
- Moving untrusted CAD computation into a Next.js request process.
- Treating tessellated meshes as exact geometry.
- Promoting a native operation based only on happy-path demos or unit tests.
- Introducing a new artifact database, viewer registry or execution framework.

## Verification and quality requirements

Every operation must declare input schema, units, coordinate frame, tolerance policy, supported geometry classes, deterministic behavior expectations, failure states, resource bounds and validation scope.

The conformance suite must include:
- Analytical reference cases and dimensional/unit invariants.
- Degenerate and near-degenerate geometry.
- Large/small coordinate magnitudes and tolerance-boundary cases.
- Invalid topology and self-intersection where relevant.
- Differential comparisons with OCCT or another independent reference provider.
- Property-based and metamorphic tests where applicable.
- Deterministic serialization, digest and reproducibility checks.
- Performance, memory, timeout and cancellation limits.
- Regression fixtures for every previously observed failure.

A passing geometry check proves only its declared invariants. It does not establish design adequacy, manufacturability, fatigue life, solver correctness or engineering approval.

## Licensing, security and operations

Review exact dependency versions, licenses, notices, patent considerations where relevant, source provenance and distribution obligations before adoption. Keep third-party implementation code and native proprietary algorithms clearly separated. Do not copy or port code unless its license permits the intended use.

Untrusted import, conversion and geometry execution remain in isolated workers with bounded CPU, memory, wall time, file size, output size and filesystem/network access. Browser/WASM execution is not a security boundary. Native binaries require reproducible builds, pinned toolchains, vulnerability review and rollback.

## Consequences

### Positive
- The product owns its engineering geometry semantics and long-term platform interfaces.
- Kernel providers can be replaced without rewriting the Engineering Core or user workflows.
- Native algorithm investment is incremental and justified by measurable gaps.
- Geometry identity, validation and provenance remain consistent across CAD, CAE and manufacturing workflows.
- The platform can eventually serve products beyond this assistant.

### Costs and risks
- Maintaining adapters and a cross-provider conformance suite is ongoing work.
- Native geometry development is technically difficult and will require specialist review.
- A mixed TypeScript/native architecture adds build, packaging and runtime complexity.
- Provider behavior and topology identity may differ; lossy conversions must remain explicit.
- Full kernel independence is a long-term investment, not a near-term product milestone.

## Immediate follow-up

1. Audit the existing `src/cad`, `src/artifacts`, `src/providers`, `src/execution` and `worker/cad` contracts and tests.
2. Complete G1 acceptance without changing existing CAD execution behavior.
3. Review and approve the G2 identity/revision/canonical-representation design before any schema migration.
4. Define the revision conformance and migration corpus, then implement G2 against existing artifact and persistence owners.
5. Begin native mathematical algorithms only after G2 revision identity and lineage are accepted.
6. Propose a separate language/runtime ADR only after a small measured prototype.

## Related documents

- [Architecture](../architecture.md)
- [Geometry Platform Charter](../geometry-platform/README.md)
- [Implementation Plan](../implementation-plan.md)
- [OCCT-first hybrid geometry foundation](adr-2026-11-08-hybrid-geometry-foundation.md)
- [Verified CAD Workspace](../v2-1-6-cad-verified-workspace.md)
