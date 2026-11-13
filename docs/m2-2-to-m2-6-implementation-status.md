# M2.2–M2.6 implementation status

**Implementation branch:** `feat/m2-2-to-m2-6-geometry-runtime`  
**Baseline:** PR #140 geometry/viewer foundation  
**Implementation PR:** #149 (draft; exact-head verification in progress)  
**Status date:** 13 November 2026

## Engineering boundary

AI may propose an operation. The application authorizes the project and exact source artifact. A bounded deterministic worker imports and processes the source. The host verifies exact digests and persists display-only derivatives with lineage. Validation, acceptance and human approval remain separate states.

Canonical BREP/STEP source bytes are never overwritten by display derivatives. A successful import or tessellation does not imply geometry validity, manufacturing suitability or approval.

## M2.2 — Revision-aware artifact lineage and derivative persistence

Implemented in this branch:
- Added an immutable `engineering_cad_display_derivatives` record with project/model/completion identity, exact source digest, model metadata revision, converter/provider version, tessellation settings, units, coordinate frame, private storage path and derivative digest.
- Added a project-authorized geometry API. It loads an accepted completion, checks project ownership, model revision, source artifact registration and private storage membership, downloads the exact source bytes and independently verifies SHA-256 before processing.
- Added GLB 2.0 display derivative generation. The GLB embeds source artifact ID/digest, units and coordinate frame in its extras.
- Persists derivative bytes in the existing private CAD artifact bucket, records metadata in the new table and writes a durable `EVIDENCE_WRITE` audit event.
- Adds idempotency keyed by source identity/digest, model revision, converter identity/version and tessellation settings.
- Adds a read endpoint that issues short-lived signed URLs and classifies derivatives as CURRENT, STALE or UNVERIFIABLE by comparing current source digest and model revision.
- Derivative persistence does not modify canonical completion records or validation/approval state.

Remaining:
- The additive migration has not yet been applied to production. Preview/production schema rollout and RLS/storage policy verification remain deployment gates.
- Model metadata revision is not a geometry revision. Exact source artifact identity and digest remain the geometry lineage anchor.
- Concurrency and ambiguous-commit reconciliation are handled conservatively, but database/storage integration tests against a provisioned Supabase environment remain required.

## M2.3 — Renderer comparison and selection evidence

Implemented:
- A static Babylon.js 9.35.0 vs Three.js 0.187.0 WebGL 2 benchmark with identical pre-tessellated workloads, warm/cold ordering rotation, initialization/first-render/frame sampling, picking and JSON export.
- Five paired trials were executed at 1, 100, 500, 1,000 and 5,000 instances on a virtualized Linux/Chrome browser.
- Both renderers completed all recorded trials; the 5,000-instance workload showed increased frame time and picking cost.
- The measurements and limitations were recorded in PR #140.

Not concluded:
- The virtual desktop was refresh/virtualization constrained and does not represent a physical engineering workstation or mid-range Android GPU.
- No Babylon.js vs Three.js production choice is justified by those observations. Paired trials on representative physical desktop and Android devices remain mandatory.

## M2.4 — CAD viewport

Implemented:
- Reuses the existing isolated custom WebGL viewport lifecycle for lineage-verified GLB display derivatives.
- Adds bounded GLB v2 parsing: no external buffers, fixed single-mesh profile, strict accessor/buffer checks, finite coordinates/normals, valid index bounds and source-lineage matching.
- Adds read-only orbit, zoom, reset and keyboard controls for generated BREP/STEP display derivatives.
- The workbench can request a derivative for a current accepted BREP/STEP artifact and display the returned private signed URL.

Limitations:
- This is a single-mesh display viewport, not a full assembly scene graph, sectioning system, persistent selection/highlighting, topology-ID mapping or measurement/PMI environment.
- Existing WebGL context-loss recovery, accessibility and mobile performance need physical-device E2E testing.
- Babylon.js and Three.js remain benchmark candidates; neither is promoted to the production renderer by this PR.

## M2.5 — OCCT geometry runtime

Implemented:
- Added a fixed OpenCascade worker for BREP and STEP import, topology counts/validity inspection and tessellation with per-vertex normals.
- Enforces direct-child artifact paths, format/extension agreement, bounded source size, linear/angular deflection bounds, finite mesh buffers, index bounds, 750k vertex cap and 250k triangle cap.
- Added an isolated Docker transport with network disabled, read-only root and mounts, dropped Linux capabilities, no-new-privileges, resource limits and exact source SHA-256 verification.
- Added an authenticated HTTPS geometry endpoint to the remote CAD worker. The remote transport is bounded to 4 MiB source artifacts; the local Docker transport accepts up to 100 MiB.
- Added a provider adapter implementing the existing geometry-kernel contract. It reports operation results only; it does not set validation or approval state.
- Added unit/protocol tests and actual BREP/STEP import/inspect/tessellate smoke checks to CI.

Verification already observed:
- The first implementation batch passed GitHub Actions run #43504028624, including `npm test`, `npm run build`, OCCT worker protocol tests, and actual generated BREP/STEP import/inspection/tessellation in the pinned build123d runtime.
- Subsequent remote transport, persistence API, GLB preview and drawing ingestion changes are included in PR #149. Exact-head CI run #43506210572 is in progress; do not treat the full batch as verified until it completes.

Remaining:
- Verify the remote worker endpoint and persistence API together in the current exact-head CI and deployed preview.
- Add representative real-world STEP assemblies, invalid files, high-face-count models, resource-exhaustion and cancellation tests.
- No topology healing, repair, Boolean modelling or persistent BREP subshape identity is claimed.

## M2.6 — Project drawing ingestion and viewer

Implemented:
- Added authenticated project-scoped drawing ingestion and listing APIs.
- Supports bounded PDF source files, a strict SVG preview subset and ASCII DXF.
- PDF signature/EOF, SVG active/external content rejection, and DXF parser/entity/bounds checks run before private storage.
- Stores drawing bytes in the private CAD artifact bucket and immutable metadata in `engineering_cad_drawings`, including SHA-256, model association, media type, parser version, units, bounds and entity count.
- Adds project/model association, role-gated upload, short-lived signed URLs and durable project-write audit events.
- Adds a project workbench upload/list/preview panel. Drawing previews remain read-only and do not validate dimensions or drafting standards.

Limitations:
- DWG is unsupported. DXF preview currently supports LINE, CIRCLE, ARC, LWPOLYLINE and TEXT; unsupported entities are reported rather than approximated.
- PDF uses the browser's native viewer. SVG is restricted to a safe static subset and is sanitized again in the browser.
- The serverless upload endpoint is limited to 4 MiB; the database record supports larger future direct-to-storage uploads.

## Release gates still open

1. Run all checks against the final PR head, not an earlier intermediate commit.
2. Apply the additive Supabase migration to a preview environment and verify table grants, RLS, private storage access, signed URL expiry and audit-chain persistence.
3. Run authenticated end-to-end tests for BREP/STEP → OCCT → GLB → private storage → signed URL → browser viewport, including stale source and wrong-project denial.
4. Run drawing upload/list/preview E2E tests for PDF, safe SVG, DXF, malformed files, spoofed MIME, unauthorized users and cross-project access.
5. Deploy the preview and inspect desktop/mobile UI, console errors, network requests, WebGL fallback and cleanup.
6. Repeat renderer trials on representative physical desktop and Android devices before selecting Babylon.js or Three.js.
7. Keep PR #140 and this implementation PR unmerged until the above release gates pass.

## Explicit non-claims

- A green build is not proof of engineering correctness.
- Tessellation is not validation.
- A display derivative is not canonical geometry.
- A signed URL is not public access.
- A latest accepted completion is not necessarily a latest geometry revision.
- No solver, manufacturing, approval or drawing-standard validation is inferred from preview success.
