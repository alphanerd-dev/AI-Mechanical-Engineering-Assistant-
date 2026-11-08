# M2.1 — CAD artifact lineage and viewer policy

**Status:** Implementation slice under review  
**Scope:** Typed provenance links and a fail-closed presentation registry for the existing bounded CAD pipeline.

## Why this slice exists

The CAD pipeline already produces a generated Python source file, a canonical BREP solid and exchange/display derivatives (STEP, STL and 3MF). The workbench currently previews only an STL from the latest accepted completion. Before expanding artifact selection or adding more viewers, the project needs explicit parent-child lineage and one authoritative policy for which formats can be previewed.

## Lineage contract

For a single execution of the current build123d cylindrical-part workflow:

1. The generated SOURCE Python artifact is the common design-input record.
2. The canonical SOLID BREP records the SOURCE artifact ID in provenance.sourceArtifactIds.
3. STEP, STL and THREE_MF exports are emitted in parallel from the same in-memory build123d shape. They therefore record the SOURCE artifact ID in provenance.sourceArtifactIds rather than claiming conversion from the persisted BREP.
4. Each STEP/STL/3MF record also carries canonicalGeometryArtifactId pointing to the associated BREP. This is a relationship to the canonical geometry record, not a conversion-parent claim.

These references are stable artifact identifiers within the persisted completion record. They do not alter storage paths or project authorization.

The lineage links express source dependency and association only. They do not assert byte equality, geometric equivalence, a BREP-to-STEP/STL/3MF conversion, manufacturing readiness or engineering approval. Because the exports are parallel siblings from the in-memory shape, the BREP relationship is represented separately and must not be described as their conversion source.

## Validation boundary

normalizeCADExecutionResult continues to create every worker-reported output as UNVALIDATED / CALCULATED. The existing acceptance workflow independently validates the exact canonical BREP bytes with the host-selected OCCT validator. Only the canonical SOLID record is subsequently marked PASS / VERIFIED and linked to its geometry evidence.

The STEP, STL and 3MF files remain UNVALIDATED unless a future format-specific validator supplies evidence for the exact bytes. A successful STL preview is a rendering result, not a geometry-validation result.

## Viewer policy

src/cad/viewer-registry.ts is a presentation-policy registry, not an execution provider or validation authority.

| Artifact kind | Current presentation mode | Boundary |
|---|---|---|
| STL | Existing bounded read-only mesh preview and download | Preview does not establish mesh quality and does not inherit BREP validation. |
| SOLID / BREP | Download only | No browser BREP viewer is registered. |
| STEP | Download only | No STEP parser or independent STEP validation is registered. |
| 3MF | Download only | No 3MF viewer or independent 3MF validation is registered. |
| SOURCE | Download only | Generated source is provenance, not proof of correct geometry. |
| DRAWING | Download only | No drawing renderer or drafting-standard validation is registered. |
| Unknown kind | Unsupported | Fail closed; do not infer a renderer from a filename or MIME type. |

The registry does not receive or return validation, verification or approval state. Its only job is to classify presentation support. The project workbench now selects stored artifacts across accepted CAD completions: STL uses the existing preview when an authorized signed URL is present, and registered download-only formats open through the signed URL returned by the existing API. This does not add format-specific geometry viewers.

## Security and runtime boundaries

- The registry does not fetch or sign storage URLs.
- The existing CAD completion API remains responsible for project authorization and short-lived private-storage signed URLs.
- The viewer may read only a URL returned by that authorized API; it must not construct storage URLs from client-supplied artifact metadata.
- Parsing/rendering errors are presentation failures. They must not mutate the completion record, validator receipt, evidence or approval state.
- Unknown formats and missing signed URLs must produce an explicit unavailable/unsupported state.

## Not delivered in M2.1

- A unified database artifact table spanning CAD, calculations and FEA.
- Model-revision snapshots or automatic stale-artifact detection.
- STEP, BREP, 3MF, drawing, FEA or point-cloud browser viewers.
- Additional format-specific validators.
- Changes to CAD execution, worker images, Supabase schema or storage policy.

## Acceptance checks

- Source-to-BREP and BREP-to-derivative links are deterministic and point to records from the same execution manifest.
- Derivative status and evidence fields remain unvalidated/empty after lineage is attached.
- The viewer registry selects STL preview only for STL, download-only for known non-preview CAD artifacts, and unsupported for unknown kinds.
- The viewer registry cannot promote validation or approval state.
- Existing CAD manifest, OCCT, artifact-persistence, workspace and production-build checks remain green on the exact PR SHA.
