# G0 — Geometry Platform Repository Audit

- **Status:** Audit completed from the repository's `main` branch as inspected on 8 November 2026.
- **Scope:** Static source, documentation, worker/container definitions, CI workflow and existing test inventory.
- **Implementation status:** No runtime source, dependencies, database schema, production configuration or CAD execution paths changed by this audit.
- **Important limitation:** This is a source-level architecture audit. No local checkout, runtime execution, test suite, benchmark, deployed worker inspection or license/legal review was performed as part of this pass.

## Executive decision

**Do not create a second CAD pipeline, artifact registry, model identity system, persistence layer or viewer registry.** The repository already contains meaningful foundations for all of these concerns.

The smallest safe path is to establish a provider-neutral geometry contract over the existing CAD pipeline, after tightening a few seams identified below. Start with typed mathematical operations and unit/frame/tolerance semantics; do not begin with a native B-rep/Boolean implementation.

The current implementation is a bounded CAD completion path, not a general geometry platform and not a proprietary kernel. That distinction must remain explicit in product maturity claims.

## 1. Existing capability map

| Concern | Existing owner | Current evidence | Audit conclusion |
|---|---|---|---|
| Canonical CAD model identity | `src/cad/identity.ts` | `CADModelIdentity`, native provider references, validation, in-memory registry | Reuse as current identity foundation; it is not a persistent version/revision model |
| Artifact identity and metadata | `src/cad/artifacts.ts`, `src/artifacts/engineering-artifacts.ts` | CAD-specific and engineering-wide artifact records | Reuse; CAD and engineering records are bridged, not a reason to add another registry |
| Artifact normalization and lineage | `src/cad/artifact-manifest.ts` | Source → BREP solid → STEP/STL/3MF lineage | Reuse; lineage records ancestry, not semantic equivalence or derivative validation |
| Execution provenance | `src/cad/provenance.ts`, `artifact-manifest.ts` | Source SHA-256, project/model/execution/provider/backend identifiers | Reuse; source digest and exact output-byte digest are distinct and must remain so |
| Authoring provider | `src/providers/build123d-cad.ts` | Typed capability provider, bounded request checks, build123d worker executor | Retain as initial bounded authoring provider |
| CAD execution contracts | `src/cad/execution.ts` | `CADExecutionRequest`, `CADExecutionResult`, `CADWorkerExecutor` | Existing execution seam; currently CAD-workflow-specific, not yet a general geometry operation API |
| Worker policy and transport | `src/execution/cad-worker-policy.ts`, `src/execution/remote-cad-worker.ts`, `src/execution/build123d-worker.ts` | Backend/capability/time limits, remote worker transport and executor | Retain isolation boundary; distinguish declared policy from enforcement at deployment/container runtime |
| Independent geometry validation | `worker/cad/occt/validate_brep.py`, `src/providers/cad-validation.ts` | BREP import, topology validity, solid count, volume, bounding box and cylinder dimension checks | Retain as initial independent validator; current checked specification is narrow |
| Validation/evidence binding | `src/cad/artifact-bridge.ts`, `acceptance.ts`, `persistence.ts` | Receipt binds artifact/model/source/backend/provider/version/digest; acceptance requires distinct validator | Strong trust foundation; extend through explicit operation/result contracts |
| Geometry metrics and regression | `src/cad/metrics.ts`, `diff.ts`, `regression.ts` | Volume, area, bounds, solid count, watertightness, DFM metrics and tolerance comparisons | Reuse; metrics are optional and not a canonical typed geometry model |
| Visualization policy | `src/cad/viewer-registry.ts`, `stl-preview.ts`, `stl-webgl-renderer.ts` | Explicit artifact-kind viewer policy; STL-only preview path | Reuse; keep renderer choice and display tessellation downstream |
| Parametric/intent entry | `src/cad/intent.ts`, `completion.ts`, `providers/cad-code.ts` | Bounded CYLINDER/shaft intent and deterministic source generation | Treat as a reference workflow, not the future universal feature model |
| Tests | `tests/cad-*.test.ts`, `tests/build123d-cad-provider.test.ts`, worker tests and CI smoke | Identity, manifest, provenance, persistence, provider, validation and worker paths | Good starting corpus; needs generalized geometry conformance fixtures |

## 2. Current execution paths

### A. Bounded application/provider path

```text
Typed capability request
  → Build123dCADProvider
  → CAD worker policy
  → CADWorkerExecutor / Docker or remote transport
  → build123d worker
  → artifact manifest
  → CAD artifact normalization + provenance
  → independent validation
  → validation receipt / evidence bundle
  → persistence and authorized display derivative
```

This path already separates application orchestration from CAD runtime execution. Keep it intact during G0/G1.

### B. Remote deterministic intent path

The remote worker documentation describes a narrower, safer endpoint: it accepts a bounded cylinder/shaft specification and an exact source template emitted by the deterministic generator, then constructs an allowlisted cylinder. It does not treat arbitrary caller-supplied Python as the remote intent contract. The BREP is separately checked by the read-only OCCT validator.

### C. Local build123d source-execution path

The build123d worker accepts generated Python source and launches it in a child process. The worker README specifies a non-root container, no network, read-only root filesystem, dedicated artifact mount and outer CPU/memory/PID/time limits. The CI workflow demonstrates these Docker restrictions for its smoke test. These controls must be confirmed in each deployed runtime; a policy object or README alone is not enforcement.

Do not merge these two execution semantics into one ambiguous API. Model them as distinct operation modes/capabilities with distinct trust and deployment profiles.

## 3. Gaps to resolve before native geometry algorithms

### P0 — Required for the G1 platform boundary

1. **No general geometry operation contract.** The current CAD request is centered on generated source, backend, filename and timeout. It does not yet express a provider-neutral operation such as create primitive, transform, measure, tessellate or Boolean operation with typed inputs and typed outputs.
2. **Units are implicit and inconsistent at the type boundary.** Metrics use names such as `volumeMm3` and `boundingBoxMm`, while `CADArtifact.units` is an optional free-form string and operation parameters are generic records. Define canonical units and explicit conversion rules; do not infer units from filenames or provider defaults.
3. **Coordinate frames are not represented as first-class contracts.** Introduce explicit frame identifiers, transform direction/convention and handedness before multi-part assemblies, imported models or robotics/CAE interoperability.
4. **Tolerance policy is local to individual validators.** The OCCT cylinder validator uses a fixed tolerance in its request path, while the validator accepts a bounded tolerance. Define typed absolute/relative tolerances, units, comparison semantics and operation-specific admissible ranges.
5. **Identity is not revisioned geometry identity.** `CADModelIdentity` represents a project-scoped logical model and provider-native references; it does not identify an immutable geometry revision or exact BREP content. Add revision/content identity at the artifact/operation level without changing the meaning of existing model IDs.
6. **Provider identity and execution backend are different concepts but currently adjacent.** Preserve the distinction: provider identifies the host-selected adapter; backend identifies the execution technology. New contracts must not conflate them.
7. **Canonical geometry versus derivatives needs a typed contract.** Current artifact kinds and lineage already imply the distinction. Make it explicit in operation result contracts: canonical exact geometry, exchange representation, tessellation and drawing are different result classes with independent validation state.

### P1 — Required before broad adoption

8. **Topology references and stability semantics are absent.** There is no product-owned vertex/edge/face reference model. Any future reference must be revision-scoped. Do not promise persistent face/edge identity across arbitrary topology-changing operations without a validated mapping strategy.
9. **Feature history and constraints are not a general parametric model.** Existing intent/code generation handles a bounded cylinder workflow. A feature DAG, dependency invalidation, sketch constraints and deterministic regeneration remain future capabilities.
10. **The current validator is shape- and specification-limited.** It checks BREP validity, solid count, positive volume, bounding dimensions and cylinder expected volume. It does not establish general surface quality, self-intersection-free design intent, manufacturability or engineering adequacy.
11. **Conformance fixtures are not yet provider-neutral.** Existing tests are valuable workflow/regression tests. Create a shared operation-level fixture schema and run it against OCCT and future native providers.
12. **Numerical robustness has no platform-wide policy.** Need explicit finite-value rules, degeneracy behavior, precision model, scale handling, tolerance propagation and deterministic failure states.
13. **Runtime conformance must distinguish local, remote, CI and browser.** Native and WASM runtimes must not be assumed equivalent. Browser execution is for presentation or bounded tasks only unless separately validated.

### P2 — Defer until justified by product demand

14. General NURBS editing, healing, offsets, advanced fillets, complex Booleans and arbitrary STEP round-tripping.
15. A universal constraint solver and full parametric history engine.
16. Native/WASM dual-runtime parity and a standalone geometry SDK/repository.
17. Broad general-purpose CAD UI features and assembly management.

## 4. Existing test and CI inventory

The source tree includes focused tests for:
- CAD identity and provider-native reference validation.
- Artifact manifest normalization and source/solid/derivative lineage.
- CAD provenance and acceptance bridge behavior.
- Build123d provider request validation and routing.
- CAD persistence path safety and verified-completion checks.
- Remote CAD worker behavior and OCCT validator failure paths.
- STL preview parsing and viewer registry policy.
- Shaft geometry intent, correction and CAD execution behavior.

The CI workflow runs `npm ci` and `npm test`, validates Python worker behavior, builds the pinned build123d container, runs the OCCT validator tests and performs CAD worker smoke tests under constrained Docker settings.

**Execution result for this audit:** not run. Repository files and CI definitions were inspected through GitHub; this audit did not execute CI, tests, benchmarks or a local build. Check status must be read from GitHub for the exact PR head before merge.

## 5. Dependency and runtime observations

- Root `package.json` contains the TypeScript/Next.js application stack; it does not declare an in-process OCCT or general-purpose geometry-kernel dependency.
- The build123d worker image pins `build123d==0.13.0` on Python 3.12.
- The remote CAD worker image also pins build123d 0.13.0 and includes the read-only BREP validator.
- The validator imports BREP through build123d's `import_brep` API, which is backed by OpenCascade; document the exact transitive OCCT version from the built image rather than assuming it from the Python package version.
- No native C++/Rust geometry-kernel build system is present in the inspected root package manifest. Do not select or add one before the separate language/runtime decision and prototype.
- CI uses Docker hardening flags for worker smoke/validation. Verify production worker deployment matches the required profile.
- A dependency license inventory and distribution review remain outstanding. No legal conclusion is made by this source audit.

## 6. Proposed G1 contract design

Add a small, typed, provider-neutral geometry boundary. Do not create a duplicate persistence or artifact system.

The first contract set should cover:

### Geometry context
- `schemaVersion`
- `modelIdentityId`
- `modelRevisionId` (immutable revision identifier, separate from logical model identity)
- `unitSystem` / explicit length unit
- `coordinateFrameId`
- `tolerancePolicy` with explicit units and absolute/relative semantics
- `sourceArtifactIds` and operation provenance

### Geometry operation request
- `operationId` and `operationType`
- typed operation parameters (no `Record<string, unknown>` as the public semantic contract)
- input artifact/revision references
- expected output classes
- provider selection constraints, if any
- timeout/resource policy and cancellation/idempotency metadata

### Geometry operation result
- explicit `SUCCEEDED | FAILED | UNSUPPORTED | INVALID_INPUT | TIMED_OUT | CANCELLED` status
- host-authored provider and backend identities
- output artifact references, separated into canonical geometry and derivatives
- warnings and structured diagnostics
- exact source/input/output digests where available
- validation/evidence references, never implicit trust promotion

### Provider adapter
- capability discovery and schema version
- operation execution and explicit unsupported-operation response
- result normalization
- deterministic error taxonomy
- no provider-specific classes in shared TypeScript contracts

### Conformance fixture
- named fixture and geometry family
- typed inputs with units and coordinate frame
- expected topology/metrics where stable
- tolerance policy
- positive, negative, degenerate and boundary cases
- provider/runtime metadata and differential comparison result

This is a proposed contract design, not implemented code.

## 7. G1 implementation sequence

1. Map all imports and call sites for identity, artifact manifest, execution, validation, persistence and viewer registry.
2. Decide which existing types remain canonical and which become compatibility projections. Keep existing persisted JSON/storage paths backward compatible.
3. Define geometry context, operation request/result and adapter contracts in the existing CAD domain boundary (exact file placement follows import graph and architecture graph).
4. Add an OCCT adapter that wraps only the already supported validation/measurement capability first; do not expose fictitious general operations.
5. Adapt the current cylinder/shaft workflow through the new contracts without changing generated geometry or acceptance semantics.
6. Add conformance fixtures for that existing workflow and prove output digest, independent validator identity and artifact lineage remain unchanged.
7. Only after this passes should native math primitives be proposed as G2.

## 8. Architecture decisions and explicit non-decisions

**Accepted**
- Keep the first platform implementation in this repository.
- Reuse current CAD identity, artifact, provenance, execution, validation and viewer seams.
- Keep OCCT as the initial exact-geometry provider and build123d as the existing bounded authoring provider.
- Preserve canonical geometry/display derivative separation.
- Develop native algorithms incrementally behind provider contracts.

**Not yet decided**
- C++ versus Rust for native geometry computation.
- Exact native math library or robust-predicate implementation.
- Whether the first native module is a TypeScript package or a native library with bindings.
- Full NURBS/B-rep representation design.
- Browser/WASM runtime scope.
- Standalone repository extraction date.

## 9. G0 exit checklist

- [x] Existing CAD model identity owner identified.
- [x] Artifact/provenance/lineage owners identified.
- [x] Authoring and validation providers identified.
- [x] Worker and container trust boundaries documented.
- [x] Viewer/display derivative boundary identified.
- [x] Existing test and CI inventory identified.
- [x] High-priority gaps and G1 contract proposal documented.
- [ ] Local build/test execution on the exact branch.
- [ ] CI green for the exact PR head.
- [ ] Dependency/license inventory and production deployment profile independently verified.
- [ ] G1 implementation plan reviewed against import graph and existing persisted artifact compatibility.

**G0 source audit is complete. G0 release/merge gate is not complete until the remaining checks are satisfied.**
