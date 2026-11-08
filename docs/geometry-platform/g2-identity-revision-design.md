# G2 Design — Geometry Identity, Immutable Revisions and Canonical Representation

**Status:** Design proposal for review; no runtime implementation or database migration is included in this document.  
**Prepared:** 8 November 2026  
**Depends on:** G1 product-owned geometry operation facade and its acceptance gates.  
**Architecture owner:** Geometry Platform.  
**Persistence owner:** Existing project/artifact persistence; no parallel artifact registry.

## 1. Decision to make

G2 must establish a durable, provider-neutral identity for each exact geometry state before native geometry algorithms are introduced.

The sequence is deliberate:

1. G0 audited the current CAD and artifact architecture.
2. G1 introduces the product-owned operation/provider boundary.
3. **G2 defines and persists immutable geometry revisions and canonical-representation lineage.**
4. G3 introduces native mathematical primitives and measurements.
5. G4 introduces selected topology structures and bounded solid construction.

The G0 audit identified immutable geometry revision identity as a P0 platform gap. Implementing native vector or curve algorithms before resolving that gap would create geometry without a reliable identity, lineage or concurrency model.

## 2. Non-negotiable distinctions

### 2.1 Logical model identity is not geometry revision identity

The existing `CADModelIdentity` identifies a project-scoped logical model and its provider-native references. Its optional `revision` field and the `modelRevision` value currently carried in provenance describe model metadata revisioning.

They must **not** be reused as a geometry revision number.

A logical model can have many immutable geometry revisions. A metadata edit can change model metadata without changing geometry. Conversely, a geometry operation can create a new geometry revision without requiring a new logical model identity.

### 2.2 Source digest is not output geometry digest

- `sourceSha256` identifies the exact source text used by a CAD execution.
- `artifactSha256` identifies the exact bytes of a particular output artifact.
- A geometry revision must bind to the digest of the exact canonical geometry artifact bytes.
- Never substitute the source digest, a filename, a storage path or a display-mesh digest for the canonical geometry digest.

If the existing artifact record does not contain a verified output-byte digest, G2 must compute it from the exact stored bytes before a revision can be recorded.

### 2.3 Canonical geometry is not an exchange or display derivative

For the current bounded CAD path:
- The BREP `SOLID` artifact is the initial canonical geometry candidate.
- STEP is an exchange derivative.
- STL/3MF and future GLB/glTF meshes are display/manufacturing derivatives with their own digests and lineage.
- Drawings are separate authored or generated documents.

A derivative may be useful without being authoritative. Validation of a BREP does not validate a STEP, STL, 3MF, drawing or display mesh.

The revision record identifies one canonical artifact. It may link related exchange and display derivatives through the existing artifact-lineage system. It must not duplicate their bytes or metadata.

## 3. Proposed domain contract

The initial contract is intentionally narrow and matches the currently supported G1 cylinder operation.

```ts
type GeometryCanonicalFormat = "BREP";

interface GeometryRevisionV1 {
  schemaVersion: 1;
  geometryRevisionId: string;          // opaque immutable ID
  projectId: string;
  modelIdentityId: string;             // existing logical CAD model ID
  geometryRevisionNumber: number;      // monotonic per logical model
  parentGeometryRevisionId: string | null;
  sourceOperationId: string;           // idempotent G1 operation ID
  canonicalArtifact: {
    artifactId: string;                // existing artifact registry ID
    artifactKind: "SOLID";
    format: GeometryCanonicalFormat;
    artifactSha256: string;            // exact output-byte digest
    units: "mm";                       // G1 supported unit
    coordinateFrameId: "WORLD_Z_AXIS";// G1 supported frame
  };
  provider: {
    providerId: string;                // host-selected adapter
    providerVersion: string;
    executionBackend: string;          // separate from provider identity
  };
  createdAt: string;
}
```

This is a conceptual contract for review, not code to copy blindly. Final TypeScript names, branded identifiers and schema validation should follow the repository's existing conventions.

### Required invariants

1. `geometryRevisionId` is opaque, unique and immutable.
2. `geometryRevisionNumber` is a positive safe integer, monotonic within one `modelIdentityId`.
3. `parentGeometryRevisionId` is null only for the first recorded revision; otherwise it identifies the exact prior head.
4. `canonicalArtifact.artifactId` references an existing artifact in the existing artifact registry.
5. The artifact belongs to the same project and logical model.
6. The artifact kind and format are compatible with the operation's declared canonical result. G2 initially accepts only the supported BREP solid result.
7. `artifactSha256` is recomputed or verified against the exact artifact bytes before revision creation.
8. Units and coordinate frame are explicit. No provider defaults or filename inference.
9. Provider identity and execution backend remain separate.
10. A revision is immutable. A geometry change creates a new revision; it never overwrites an existing revision.
11. Validation status, verification status, approval status and evidence are not mutable fields on the geometry revision.
12. No persistent face/edge/vertex identifiers are promised in G2. Topology references are deferred to G4 and must be revision-scoped.

## 4. Persistence design

### Reuse existing owners

- Existing CAD model identity remains the logical model owner.
- Existing artifact registry remains the artifact metadata and storage-reference owner.
- Existing object storage remains the owner of artifact bytes.
- Existing provenance and evidence systems remain the source of execution and validation lineage.
- The geometry revision record is a new relationship/identity record only. It is not another artifact registry and stores no geometry bytes.

### Proposed relational shape

Subject to confirming the exact production schema and foreign-key names, use a dedicated revision relation such as `engineering_geometry_revisions`:

| Field | Purpose |
|---|---|
| `id` | Opaque geometry revision ID |
| `project_id` | Tenant/project isolation |
| `model_identity_id` | Existing logical CAD model |
| `revision_number` | Monotonic geometry revision sequence |
| `parent_revision_id` | Previous immutable revision |
| `source_operation_id` | Idempotency and operation lineage |
| `canonical_artifact_id` | Existing artifact record |
| `canonical_artifact_sha256` | Exact canonical bytes digest |
| `canonical_format` | Initial value BREP |
| `units` | Initial value mm |
| `coordinate_frame_id` | Initial value WORLD_Z_AXIS |
| `provider_id`, `provider_version` | Host-selected provider provenance |
| `execution_backend` | Actual execution technology |
| `created_at` | Server-authored timestamp |

Candidate constraints:
- Unique `(project_id, model_identity_id, revision_number)`.
- Unique `(project_id, model_identity_id, source_operation_id)` for idempotent creation.
- Foreign keys to the existing model and artifact records after the production schema audit confirms their canonical tables.
- Index `(project_id, model_identity_id, revision_number DESC)` for current-head lookup.
- Composite project/model foreign-key checks to prevent cross-project references.

Do not add a new artifact blob table, geometry object store or parallel model identity table.

### Head and concurrency

Revision creation must be transactional:
1. Resolve and authorize the project and model identity server-side.
2. Read the current geometry revision head.
3. Require the caller's `expectedParentGeometryRevisionId` to match the current head (or null for first revision).
4. Verify the canonical artifact and digest.
5. Insert the immutable revision with the next revision number.
6. Commit atomically.

A stale parent returns a conflict such as `STALE_GEOMETRY_REVISION`; the service must not silently rebase a geometry operation onto a different head.

A repeated `sourceOperationId` with identical model and artifact binding returns the already-created revision. Reuse of the same operation ID with different artifact bytes is rejected.

Do not maintain a mutable latest-revision pointer until there is a demonstrated query/performance need. If one is later introduced, update it in the same transaction and treat it as a cache/index, not the source of revision truth.

## 5. Validation and evidence binding

A geometry revision is an immutable identity record, not a validation result.

A future validation receipt should bind at minimum:
- `geometryRevisionId`
- `canonicalArtifactId`
- `canonicalArtifactSha256`
- validator provider and version
- validation ruleset/schema version
- declared checks and their outcomes
- execution/evidence identifiers
- timestamp and exact input context

The existing independent OCCT validator remains the initial BREP validation provider. Its receipt must not be copied to STEP/STL/3MF or to a later geometry revision.

Validation outcomes, human verification and approval remain separate state transitions. Creating a geometry revision does not make it valid, verified, approved or fit for manufacture.

## 6. API/service boundary

The initial service surface should be internal to the Geometry Platform and called through the existing capability/task execution boundary. Do not expose a second unauthenticated CAD API.

Conceptual operations:
- `createGeometryRevision(input, expectedParent)`
- `getGeometryRevision(projectId, geometryRevisionId)`
- `listGeometryRevisions(projectId, modelIdentityId)`
- `getGeometryRevisionHead(projectId, modelIdentityId)`
- `assertGeometryRevisionCurrent(projectId, modelIdentityId, geometryRevisionId)`

The server derives the project from authenticated workspace context. User-supplied project IDs are never treated as authorization.

Structured failure codes should include:
- `MODEL_NOT_FOUND`
- `ARTIFACT_NOT_FOUND`
- `ARTIFACT_PROJECT_MISMATCH`
- `ARTIFACT_MODEL_MISMATCH`
- `UNSUPPORTED_CANONICAL_FORMAT`
- `MISSING_CANONICAL_DIGEST`
- `CANONICAL_DIGEST_MISMATCH`
- `MISSING_UNITS_OR_FRAME`
- `STALE_GEOMETRY_REVISION`
- `DUPLICATE_OPERATION_ID`
- `UNVERIFIABLE_LEGACY_ARTIFACT`

## 7. Legacy artifact migration

Existing CAD artifacts may not have a geometry revision ID or a verified output-byte digest.

- Do not synthesize a geometry revision from `CADModelIdentity.revision` or provenance `modelRevision`.
- Do not mark an artifact current merely because it is the latest accepted completion.
- Artifacts missing exact output digest, model linkage or trustworthy operation provenance remain `UNVERIFIABLE` for geometry revision purposes.
- A baseline revision may be backfilled only when the exact canonical artifact bytes, digest, project/model linkage and source operation/provider lineage can be independently established.
- Backfill must be idempotent, auditable and non-destructive. Existing artifact IDs and evidence references remain unchanged.
- Any migration must be reviewed against a production schema snapshot and tested on a non-production copy before deployment.

## 8. G2 acceptance suite

G2 is complete only when the following are demonstrated:

1. Create the first revision for a supported canonical BREP artifact.
2. Create a second revision with the correct parent and a monotonically increasing revision number.
3. Reject stale-parent and concurrent conflicting writes.
4. Make repeated idempotent requests return the same revision.
5. Reject the same operation ID when bound to different artifact bytes.
6. Reject digest mismatch, missing digest, wrong artifact kind/format and missing units/frame.
7. Reject cross-project and cross-model artifact references.
8. Preserve immutable parent revision bytes/metadata after a child is created.
9. Distinguish source code digest from canonical geometry output digest.
10. Keep STEP/STL/3MF and display derivatives distinct from canonical geometry.
11. Keep geometry revision state separate from validation, verification, approval and evidence.
12. Preserve legacy artifacts as unverifiable when trustworthy revision lineage cannot be reconstructed.
13. Pass transaction, authorization, isolation, idempotency and rollback tests.
14. Pass the existing CAD cylinder/shaft workflow without changing its current user-facing behavior.

## 9. Explicit non-goals

G2 does not implement:
- Native vector, curve, surface or Boolean algorithms.
- Topology naming, persistent face/edge/vertex references or topology mapping.
- Feature history, sketch constraints or parametric regeneration.
- General STEP import/export or geometry healing.
- New CAD viewer or renderer selection.
- OCCT replacement or a standalone geometry-kernel repository.

Those remain later, separately gated increments.

## 10. Updated programme sequence

| Increment | Deliverable | Exit condition |
|---|---|---|
| G0 | Repository and contract audit | Existing owners and gaps reviewed |
| G1 | Product-owned geometry operation/provider boundary | Existing bounded cylinder path passes through the facade |
| **G2** | **Geometry identity, immutable revisions and canonical representation** | Revision, digest, lineage, concurrency and migration tests pass |
| G3 | Native mathematical foundation | Analytical, property and differential fixtures pass |
| G4 | Selected topology and bounded solid construction | Topology invariants and geometric reference tests pass |
| G5 | Advanced native operations | Adversarial, differential and resource gates pass per operation |
| G6 | Parametric feature and constraint intelligence | Deterministic regeneration and solver edge cases pass |
| G7 | Independent productization | Stable API, release process, runtime matrix and external consumer exist |

## 11. Implementation order after design approval

1. Confirm the exact production model/artifact tables, storage immutability and current artifact digest availability.
2. Finalize the revision schema and TypeScript contract.
3. Add pure contract validation and revision-service unit tests.
4. Add a non-production database migration with uniqueness, foreign-key and project-isolation constraints.
5. Implement transactional revision creation and idempotency.
6. Bind the current G1 cylinder operation result to a geometry revision.
7. Add read APIs and artifact UI lineage only after service acceptance.
8. Run existing CAD/OCCT end-to-end tests and migration rollback tests.
9. Promote only after exact-head CI, non-production migration acceptance and review.

No production schema or CAD route should change as part of this design-only increment.
