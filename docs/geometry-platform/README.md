# Geometry Platform — Architecture Charter

**Status — 15 November 2026:** G0, G1 and G2 are implemented on main. G2 immutable revision schema/contract was merged in [PR #163](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/163); trusted server-side persistence, authorized history reads, exact BREP digest verification, idempotency/concurrency and atomic audit were delivered in [PR #165](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/165). The additive G2 and manufacturing migrations are applied to production; the production application is READY at commit 9bfb57e86e70db84a682d162bba9253e0185c920. Authenticated production-session API acceptance remains open. No native geometry kernel is delivered.
**Repository boundary:** This repository, initially alongside the existing CAD modules.  
**Product rule:** AI proposes. Deterministic systems execute. Validation decides. Evidence proves.

## Mission

Create a reusable, product-owned geometry platform that turns typed engineering intent into traceable, validated geometry outcomes. The platform is proprietary at the architecture, domain-contract, feature-semantics, provenance and engineering-intelligence layers. Its geometric algorithms become progressively independent where evidence justifies the investment.

This is not a claim that the repository already contains a proprietary B-rep kernel.

## Current baseline

The repository already contains:
- CAD identity, provenance, artifact-manifest, artifact bridge and persistence modules under `src/cad` and `src/artifacts`.
- CAD routing, completion, execution, acceptance, diff, DFM and viewer-registry modules.
- A bounded build123d provider and isolated CAD worker path.
- An independent OpenCascade BREP validator.
- Geometry-related tests for provider generation, artifact manifests, identity, routing, provenance, execution, persistence, correction and viewer registration.

These are existing assets to audit and reuse. The platform must not create a second artifact identity, viewer registry, persistence layer or CAD execution route.

## Target logical architecture

```text
Engineering Workspace / Engineering Core
                 |
       Typed geometry intent
                 |
     Geometry Platform API
                 |
    +------------+-------------+
    |            |             |
 Domain model  Feature model  Constraint model
    |            |             |
    +------ Operation planner --+
                 |
        Kernel/provider adapter
          /             \
   Native algorithms   OCCT adapter
          \             /
       Canonical geometry result
                 |
      Independent validation
                 |
   Artifact + provenance + evidence
                 |
     Tessellation/display derivative
                 |
       Renderer-neutral viewer
```

The diagram is a target responsibility map, not an assertion that every component exists.

## Ownership and non-ownership

### Owned by the geometry platform
- Stable engineering geometry identity and revision semantics.
- Typed operation contracts and capability/version metadata.
- Units, coordinate frames, tolerances and transformation semantics.
- Feature intent, operation history and dependency relationships.
- Constraint and design-intent metadata.
- Provider-neutral result/error states.
- Source artifact, derivative, conversion and validation lineage.
- Conformance fixtures, differential tests and regression corpus.
- Engineering-specific checks where they are deterministic and independently testable.

### Initially provided by established engines
- Mature exact curve/surface and B-rep algorithms.
- Robust general Boolean operations and intersections.
- Broad CAD import/export and healing.
- Mature offset, fillet, chamfer and complex surface operations.

OCCT is the initial exact-geometry provider. build123d remains the existing bounded authoring provider. Provider selection and exact binding/runtime promotion remain subject to version, license, packaging, security and conformance review.

### Progressively developed natively
1. Mathematical primitives, transforms, coordinate frames and bounding operations.
2. Robust predicates and tolerance-aware measurements.
3. Selected topology structures and simple analytic geometry.
4. Primitive solid construction, extrusion and revolution.
5. Advanced intersections/Boolean operations only after a substantial robustness corpus.
6. Parametric feature regeneration and constraint integration.

No native operation replaces an established provider until its conformance gate passes.

## Repository placement

Do not introduce a second GitHub repository or an arbitrary new monorepo package now. First audit and evolve the existing modules:

| Existing area | Platform responsibility |
|---|---|
| `src/cad/identity.ts`, `provenance.ts`, `artifact-manifest.ts` | Existing identity and lineage foundations; consolidate only after contract audit |
| `src/cad/artifacts.ts`, `artifact-bridge.ts`, `src/artifacts/*` | Existing artifact boundary; do not create a parallel registry |
| `src/cad/intent.ts`, `completion.ts`, `routing.ts` | Typed intent and bounded operation routing |
| `src/providers/build123d-cad.ts`, `src/providers/cad-validation.ts` | Existing authoring and validation provider boundaries |
| `src/execution/remote-cad-worker.ts`, `worker/cad/*` | Isolated execution and validation runtimes |
| `src/cad/viewer-registry.ts`, `stl-preview.ts` | Existing display/viewer boundary; renderer decision remains separate |

A future native implementation may live under `native/geometry-kernel/` after the language/runtime ADR. A future TypeScript-facing stable facade may be introduced only after the audit identifies a clear owner and migration plan. Avoid creating empty folders or duplicate placeholder contracts.

## API design principles

- Typed, versioned operation requests and results; no arbitrary caller-supplied code execution.
- No OCCT-specific classes in cross-provider product contracts.
- Explicit units, coordinate frames, tolerance and supported geometry types.
- Stable artifact IDs and revision-scoped topology references; do not promise face/edge identity across topology-changing operations unless a validated mapping exists.
- Canonical geometry is authoritative; tessellated meshes are display derivatives.
- Validation receipts bind to exact artifact bytes, inputs, provider/runtime and declared checks.
- Provider failure, unsupported operation and timeout are explicit states, never silent fallback to a weaker result.
- No LLM-generated geometry is treated as validated merely because it parses or renders.

## Runtime boundaries

- Next.js handles authorization, typed requests, orchestration and project-scoped state.
- Geometry execution, untrusted import and conversion remain in bounded isolated workers.
- Browser rendering consumes authorized display derivatives; it is not the geometry authority.
- WASM/native dual execution is a future optimization, not an initial requirement.
- Cancellation, idempotency, limits and cleanup must be explicit for long-running operations.

## Conformance suite

Before implementing native algorithms, define canonical fixtures with expected dimensions, bounds, volume, topology counts where stable, transforms and failure modes.

Every provider and native operation should be tested for:
- Valid and invalid input schemas.
- Units and coordinate transforms.
- Numerical tolerances and boundary behavior.
- Degenerate/near-degenerate cases.
- Topology invariants and invalid solids where applicable.
- Differential comparison against OCCT or another independent provider.
- Determinism, serialization and digest behavior.
- CPU, memory, wall-time and output-size limits.
- Regression reproduction for every discovered defect.

Tests prove only the properties they assert. Geometry validity is not design approval, manufacturability or physical adequacy.

## Initial delivery sequence

| Increment | Deliverable | Exit condition |
|---|---|---|
| G0 | Existing CAD/geometry contract and dependency audit | Current call graph, contract inventory, duplicate map and gaps reviewed |
| G1 | Product-owned geometry facade and initial adapter conformance tests | Existing cylinder/shaft workflow is exposed through a versioned typed contract without changing its execution or persistence path |
| G2 | Geometry identity, immutable revisions and canonical representation | Revision, digest, lineage, concurrency and migration tests pass |
| G3 | Native mathematical foundation | Analytical, property and differential fixtures pass |
| G4 | Selected topology and bounded solid construction | Topology and geometric invariants pass |
| G5 | Advanced native operations | Adversarial/degenerate tests, differential tests and resource gates pass |
| G6 | Parametric feature/constraint system | Deterministic regeneration and solver edge cases pass |
| G7 | Independent productization | Stable API, release process, runtime matrix and external consumer exist |

## G0 audit result

The source-level G0 audit is recorded in [G0 Repository Audit](g0-repository-audit.md). It confirms the existing CAD identity, artifact, provenance, worker, validation and viewer foundations should be reused. It identifies missing provider-neutral geometry operation contracts, explicit units/frames/tolerance policies, immutable geometry revision identity and provider-neutral conformance fixtures. The audit is source-level only; local test execution, exact-PR CI, deployment verification and dependency/license review remain open gates.

## G1 delivered

G1 is delivered in [PR #139](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/139), merged on 8 November 2026. Its exact PR head completed Engineering Core CI, ESLint, CodeQL and Codacy successfully. It adds a bounded product-owned operation facade over the existing CAD completion workflow; it does not replace OCCT or implement native geometry algorithms.

The initial typed facade includes:
- `src/geometry-platform/contracts.ts` for versioned operation requests, results and provider interfaces.
- `src/geometry-platform/cad-completion-provider.ts` for adaptation of the existing completion workflow.
- `geometry.create_cylinder` as the only advertised operation.
- Explicit millimetre units, the existing world +Z cylinder convention and the host-controlled 0.01 mm dimension-tolerance policy.
- Separate execution and validation provider identities, with artifacts remaining references to the existing CAD artifact model.

The adapter does not own execution, persistence, validation, identity, rendering or worker lifecycle. No native algorithms, general transforms, topology IDs, Boolean operations, assemblies or parametric history are claimed. Existing routes and production behavior were not switched to the new facade in G1.

## G2 — immutable identity and trusted persistence delivered; acceptance hardening next

The G2 schema and provider-neutral TypeScript contract are merged in PR #163. The migration creates `engineering_geometry_revisions` as a project-scoped lineage index over existing CAD model/completion/Storage records; it does not create a second artifact registry or duplicate geometry bytes. Composite model/completion/self-revision foreign keys, model-row locking, current-head sequencing, accepted-completion checks, exact SOLID artifact binding and immutable UPDATE/DELETE guards are included.

The original G2 schema was first rehearsed on the dedicated E2E Supabase project with rollback-only tests for initial/child revision creation, stale-parent and skipped-number rejection, duplicate source-artifact binding and immutable mutation rejection. The subsequent trusted-persistence and manufacturing increments were applied to production through eight additive migrations on 15 November 2026. Production migration history confirms all eight versions are present. Post-migration checks confirmed RLS on the evidence tables, no direct authenticated/anon table reads, service_role SELECT/INSERT without UPDATE/DELETE, immutable triggers and SECURITY INVOKER write RPCs restricted to service_role. The original rollback rehearsal remains evidence for the schema invariants; it is not a substitute for authenticated production API acceptance.

The trusted persistence boundary is implemented in PR #165. It resolves the accepted completion and exactly one canonical SOLID from the server-owned manifest, downloads the existing private execution-scoped BREP object, recomputes SHA-256, rejects digest/provenance mismatch, enforces expected-parent concurrency and idempotent replay, and commits the immutable revision plus audit event in one transaction. Project-authorized reads are exposed through the authenticated API; privileged writes remain server-side.

**Remaining G2 exit work:** authenticated production-session creation/history tests using a real project and accepted CAD completion; negative tests for mismatched digest/provenance, stale parent, replay and cross-project access; and audit-chain assertions. The routes are deployed, but successful authenticated production transactions have not yet been demonstrated. G3 native mathematical primitives should begin only after these G2 lineage acceptance gates pass.
