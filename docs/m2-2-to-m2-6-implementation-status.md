# M2.2–M2.6 implementation status

**Branch:** feat/m2-2-to-m2-6-geometry-viewer-foundation  
**Intent:** deliver the shared contract, comparison and drawing-viewer foundations in one reviewable release candidate without promoting capabilities that the current workers cannot execute.

## M2.2 — Revision-aware artifact lineage

Implemented in this slice:
- CAD model database metadata revision is carried through the API and CAD model identity contract.
- Execution provenance captures the model metadata revision when supplied. It is explicitly not called a geometry revision.
- Source-to-BREP and export lineage now describes the actual build process: build123d emits BREP, STEP, STL and 3MF in parallel from one in-memory shape. Export records point to the common generated source and retain the BREP as canonicalGeometryArtifactId; they do not claim that the STEP/STL/3MF was converted from persisted BREP bytes.
- A strict display-derivative contract requires exact source digest, model identity/revision, converter/version, tessellation settings, units, coordinate frame and derivative digest.
- The workbench identifies earlier accepted completions for the same model identity as HISTORICAL and leaves them inspectable.

Limitations:
- The current model metadata revision is not a geometry revision. Geometry revision must be represented by immutable source artifact identity/digest and accepted completion lineage.
- Currentness is inferred from the latest accepted completion for that model identity. A future revision-edit API and explicit geometry revision token should replace that coarse rule before general assemblies or collaborative editing.
- Display derivative contract is not yet persisted in a separate derivative resource; it is ready to be used by an authorized conversion endpoint.

## M2.3 — Renderer abstraction and benchmark

Implemented:
- Renderer-neutral display mesh, camera, capability, session and adapter contracts.
- A static, isolated Babylon.js vs Three.js benchmark, pinned to Babylon.js 9.35.0 and Three.js 0.187.0.
- WebGL 2-only comparison, identical repeated box transforms, orbit and picking sample loops, initialization/first-render/frame-time sampling and JSON export.
- No renderer packages are added to the production application.

Limitations:
- The harness requires paired runs on target devices. No production renderer is selected from a single CI machine.
- Its first workload is a renderer microbenchmark, not a full CAD assembly/section/topology test. The device matrix and engineering workloads in the implementation plan remain mandatory.

## M2.4 — Interactive CAD viewport adapter

Implemented:
- The application-level adapter contract is defined and the existing STL preview remains isolated behind its own lifecycle module.
- The workbench now has a format-aware drawing preview seam and explicit current/historical status.

Not promoted:
- Babylon.js or Three.js is not selected or integrated into the production CAD viewport. That work is deliberately blocked on M2.3 paired-device results and minimum gates. Adding one package now would make the comparison meaningless and create an unsupported production decision.

## M2.5 — OCCT geometry adapter

Implemented:
- A product-owned geometry-kernel contract for exact BREP/STEP source bytes, model revision, units, coordinate frame, topology summary and tessellation result.
- Explicit unsupported operation response for geometry import/tessellation when the provider has not registered those operations.

Not promoted:
- The current remote OCCT worker only supports validate_geometry; it does not provide general STEP/BREP import, topology-query or tessellation endpoints. This PR does not claim otherwise.
- Full OCCT adapter implementation requires a separately versioned worker API, pinned runtime image, file/CPU/memory/output limits, import fixtures, topology/volume/dimension conformance tests and an authorized private-artifact derivative persistence path.

## M2.6 — Drawing visualization

Implemented:
- Bounded ASCII DXF parser for LINE, CIRCLE, ARC, LWPOLYLINE and TEXT.
- Bounds, units and unsupported-entity warnings.
- DXF layer visibility, zoom/fit controls and an explicit two-point Euclidean distance tool reporting declared drawing units.
- SVG image-only sanitizer with a strict element/attribute allowlist; scripts, foreignObject, event attributes, styles, links and external resource references are removed.
- Read-only PDF, sanitized SVG and basic DXF viewer component.
- Viewer registry only enables preview when trusted artifact metadata declares one of the supported drawing media types.

Limitations:
- DWG is not supported. DXF spline, hatch, block, dimension and bulge-arc semantics are not implemented; unsupported content is reported. Layer toggling and distance readout are preview interactions, not full drafting-layer management or dimensional/standards validation.
- The present CAD completion flow does not ingest arbitrary drawings. The viewer requires a project-authorized completion/artifact record with trusted mediaType and an API-issued short-lived signed URL.
- PDF preview depends on the browser's native PDF support; it is not a PDF parser or drawing-standard validator.

## Release gate

This branch is a foundation release candidate, not proof that every M2.2–M2.6 exit gate has passed. In particular, the renderer choice, production renderer integration and OCCT import/tessellation are blocked on evidence and worker capability. Do not merge or deploy a production renderer/geometry importer until those gates are met.
