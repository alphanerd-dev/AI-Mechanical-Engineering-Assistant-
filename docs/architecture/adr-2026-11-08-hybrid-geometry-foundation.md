# ADR — OCCT-first hybrid geometry foundation

- **Status:** Accepted — architectural direction. Exact binding/runtime adoption and broader format support remain gated.
- **Decision date:** 8 November 2026
- **Owners:** Engineering platform architecture
- **Scope:** Canonical mechanical geometry, CAD provider integration, topology and display-geometry derivation.

## Context

The repository currently supports a deliberately bounded cylindrical CAD workflow: typed intent, deterministic build123d generation, an isolated worker, artifact registration and independent OCCT BREP validation. This is not a general-purpose CAD authoring or interchange system.

The product needs a geometry foundation capable of supporting exact BREP/topology operations and multiple CAD authoring/interchange providers without making a browser renderer or one CAD vendor the product's identity.

A proprietary geometry kernel would impose a large and continuing burden in robust topology, boolean operations, intersections, tolerances, numerical stability, import/export and conformance testing.

## Decision

Adopt an **OCCT-first hybrid geometry foundation**.

1. Use **OpenCascade Technology (OCCT)** as the initial geometry-kernel direction for BREP/topology operations, geometry import/inspection and tessellation.
2. Retain the existing bounded **build123d** authoring provider. Evaluate CadQuery, FreeCAD and Onshape as independent providers when specific user workflows justify them.
3. Define a product-owned engineering geometry/domain model **above** kernel adapters. It owns engineering identity, revisions, units, coordinate frames, provenance, feature/operation metadata, constraints, artifact relationships and validation relationships. It does not reimplement the kernel's geometric algorithms.
4. Isolate kernel-specific calls behind versioned adapters and shared conformance fixtures. Do not leak OCCT-specific types into the Engineering Core's cross-provider artifact and capability contracts.
5. Keep canonical CAD/source artifacts separate from tessellated display derivatives. Every derivative binds to the exact source artifact ID, revision and digest and records converter/kernel identity and version, tessellation settings, units and coordinate frame.
6. Use browser/WASM geometry processing only where the task, model size, memory limits, licensing and browser compatibility justify it. Use isolated backend workers for heavy or untrusted conversion and validation. Browser parsing is not a security boundary.
7. Do **not** start a proprietary geometry-kernel programme now. Alternative or proprietary kernels require a demonstrated capability/performance/licensing gap, commercial justification, independent conformance suite and separate ADR.

OCCT is an initial architectural direction, not blanket approval of every binding, build, license configuration or production runtime. Exact versions, licenses/notices, packaging, supported formats, security, limits and acceptance fixtures must be reviewed before promotion.

## Geometry ownership model

| Concern | Owner |
|---|---|
| Exact solids, surfaces, curves, topology and geometric operators | Selected kernel adapter; initially OCCT |
| CAD authoring semantics and parametric operations | Typed authoring provider such as the bounded build123d path |
| Stable engineering identity and revision | Product-owned engineering artifact/domain layer |
| Units, coordinate frames and declared tolerances | Versioned engineering contracts |
| Format conversion and tessellation provenance | Isolated conversion provider + artifact lineage |
| Display meshes, materials, scene graph and viewport state | Visualization subsystem; renderer-neutral |
| Validation status and evidence | Independent capability-specific validators and evidence contracts |
| Human acceptance and release approval | Authorized engineering reviewer |

## Canonical geometry versus display geometry

Canonical bytes and display meshes are different representations with different purposes.

- Canonical artifacts preserve the source engineering representation and its exact byte identity.
- Display derivatives are optimized for rendering and may approximate curves/surfaces through tessellation.
- A display derivative must include source ID/revision/digest, conversion provider/version, tessellation parameters, units and coordinate frame.
- A picked triangle/face/edge maps to a persistent CAD topology identifier only where the converter provides and validates an explicit topology map. Screen-space picking is not stable topology identity.
- Engineering-grade dimensions and properties must be evaluated from canonical geometry or another declared deterministic authority, not inferred from a screen-space mesh.
- Validation applies only to the exact bytes and checks recorded in the receipt. Passing BREP validation does not automatically validate STEP/STL/3MF exports.

## Options considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| OCCT-first hybrid with product-owned domain layer | Mature open geometry foundation; preserves kernel flexibility and the existing OCCT validation seam | Binding/runtime integration, licensing and large-model performance still require proof | Adopt |
| Proprietary kernel immediately | Complete control over internal architecture and long-term roadmap | Extremely high scope, correctness burden and time-to-value before a demonstrated need | Reject for now |
| Single vendor kernel as product foundation | Potential broad native feature coverage and vendor integration | Commercial/licensing dependency and reduced provider neutrality | Defer; evaluate only against concrete demand |
| Renderer as geometry authority | Convenient client-side object model | Display geometry is lossy and does not provide authoritative CAD topology/design intent | Reject |

## Consequences

### Positive
- Reuses the existing OCCT validation foundation instead of restarting geometry work.
- Separates product engineering semantics from kernel-specific representations.
- Supports multiple CAD authoring and import providers over time.
- Makes canonical/display lineage explicit and protects engineering measurements from rendering approximations.
- Defers costly custom-kernel work until a real need is demonstrated.

### Negative / costs
- A stable adapter and conformance suite must be maintained.
- Different providers may preserve different levels of feature history, topology identity and metadata; conversion cannot promise lossless design intent.
- Browser/WASM and native-worker deployments may have different supported capabilities and performance.
- Cross-kernel comparisons require defined tolerances and careful treatment of units and topology.

## Conformance and promotion gates

Before a kernel/binding/provider becomes supported, verify:
- Exact source revision, release, maintenance, license and notice obligations.
- Import/export and round-trip behaviour for declared formats and versions.
- Solid/shell/face/edge topology validity and expected entity counts where deterministic.
- Dimensions, volume, mass properties, units, coordinate frames and tolerance behaviour against known fixtures.
- Boolean/intersection and degenerate-geometry failure behaviour where those operations are in scope.
- Stable topology mapping behaviour where selection identity is promised.
- Memory, CPU, wall-time, file-size and output-size limits.
- Reproducible worker packaging, security isolation, logging and rollback.

## Follow-up actions

1. Audit current CAD artifact/model/completion types and OCCT validation receipts before defining any new contract.
2. Define the product-owned geometry/artifact schema and adapter interfaces.
3. Evaluate exact OCCT/OCP/OpenCascade.js binding options, license and deployment packaging.
4. Create canonical geometry fixtures and independent conformance tests.
5. Retain build123d as the first authoring provider; evaluate other providers only against named workflows.
6. Update the implementation ADR when format coverage, runtime and supported provider status have evidence.

## Related documents

- [Architecture](../architecture.md)
- [Implementation Plan — geometry foundation](../implementation-plan.md)
- [Verified CAD Workspace](../v2-1-6-cad-verified-workspace.md)
- [Engineering Ecosystem Registry](engineering-ecosystem-registry.md)
