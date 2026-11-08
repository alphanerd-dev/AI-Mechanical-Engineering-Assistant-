# Implementation Plan and Milestones

**Updated:** 8 November 2026  
**Status:** M0 is complete with its stated limitation. The M1 conversational chat foundation is implemented and browser-accepted on the tested revision. M2 — shared artifact infrastructure and interactive CAD visualization — is the next priority and remains planned; no production 3D renderer has been selected.

This document is the current source of truth for priority, milestone status and exit gates. Historical dated records remain under `docs/plans/`; they preserve what was known at the time and do not override this current status.

## Product and engineering rule

**AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**

Preserve the existing Next.js/React/TypeScript control plane, Supabase project/workspace and authorization boundaries, provider-neutral Engineering Core, deterministic providers, isolated workers, validators and artifact/evidence contracts. Add libraries and abstractions only when they close an evidenced gap.

## Current baseline

| Area | Current state | Boundary |
|---|---|---|
| Web workspace | Next.js 16 App Router, React 19 and TypeScript. Forge workspace shell, responsive navigation, project routes and authenticated account surfaces. | The UI is not the Engineering Core; authorization remains server-side. |
| Identity and persistence | Supabase SSR/client integration, server auth routes, protected project APIs, project/workspace persistence and conversation/session history. | Do not treat a browser session or public key as project authorization. |
| Conversational chat | assistant-ui + Vercel AI SDK; streamed project chat route; project-scoped history; Gemini provider; Markdown/code/math rendering; edit/copy/regenerate/stop controls. | Conversational answers do not execute CAD/FEA, privileged tools, project mutations or formal validation. |
| Engineering task interaction | Separate Engineering Core panel for existing registered deterministic workflows and decision states. | It is not an LLM tool-call executor. A capability must be explicitly implemented and validated before it is exposed. |
| Deterministic calculations | Shaft torque, pump-power and a new solid-shaft static-yield pilot with explicit gear geometry, axial force, deterministic diameter solve, revisioned state, digests and validation receipt. | The shaft pilot is preliminary static yield only; it is not fatigue, complete shaft design, ASME compliance or design approval. |
| CAD | Explicit cylindrical/shaft generation using deterministic build123d code, separate remote worker, artifact registration and independent OCCT BREP checks. | Do not infer general CAD/assembly support or automatic validation of every exported format. |
| Visualization | No shared artifact/viewer registry or complete interactive CAD/FEA/P&ID viewer. Babylon.js and Three.js are candidates for a controlled renderer benchmark; VTK.js is a separate scientific-visualization candidate. | Candidate evaluation is not dependency adoption. Canonical artifacts, conversion derivatives and viewer state must remain distinct. |
| FEA | Reference Gmsh/CalculiX cantilever benchmark worker and related adapter contracts. | Pilot/reference scope; no general FEA mesh/result viewer or broad structural certification. |
| Physical perception | Isolated Open3D inspection/ICP registration prototype. | No public scan upload, persistent artifact registry integration or production perception claim. |
| CI and browser evidence | Core CI includes tests, worker checks, security analysis and production build. The isolated Playwright public UI suite includes the authenticated chat-rendering test. | Each run proves only the assertions that ran on its exact SHA and environment. |
| Outcome economics | Collection methodology exists. | Engineering time saved, cost per accepted outcome and ROI remain NOT MEASURED until real matched trials exist. |

## M0 — Trustworthy decisions, recovery and evidence

**Status: COMPLETE WITH LIMITATION.** The bounded deterministic calculation, project/workspace persistence, result-state separation, idempotency and artifact/evidence foundations are implemented. The economic outcome baseline remains **NOT MEASURED**. This milestone does not certify all mechanical engineering outputs, all CAD or FEA workflows, or measurable productivity improvement.

## M1 — Conversational chat foundation

**Status: IMPLEMENTED AND BROWSER-ACCEPTED for the current chat scope.**

### Delivered

- assistant-ui conversation UI integrated with the Vercel AI SDK runtime.
- Authenticated server-side stream route at `/api/projects/[projectId]/engineering/chat`.
- Server-side Gemini provider; default model `gemini-3.5-flash-lite`; browser requests cannot control provider, model, system prompt or tools.
- Project-scoped remote thread identity and persistence through the existing project conversation/session machinery.
- Streaming-aware Markdown rendering with headings, emphasis, links, code blocks, tables and currency-safe text.
- LaTeX normalization and display-math block repair, fenced-code preservation, Streamdown math plugin and KaTeX styles.
- Chat controls for edit, copy, regenerate and stop generation; composer suggestions; responsive desktop/mobile layout.
- Dedicated regression tests and authenticated Playwright assertions for Markdown, inline/display math, code, tables and currency.

### Acceptance evidence on the chat implementation revision

The chat implementation commit `ed2b4b7229dc5c845123fd9db0db5c150c79ffc2` was checked by Engineering Core CI run [41296615951](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/41296615951). All 34 job steps passed, including the unit test suite, worker/runtime checks and production Next.js build.

The isolated authenticated Playwright run [41298598698](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/41298598698) passed 4/4 tests. The chat test verified streamed Markdown, inline and display equations, code, tables and currency at desktop and mobile widths. The axe scan returned zero violations. The stream response was mocked in the browser test: this proves the chat client/rendering path, not live Gemini response quality or live CAD execution.

### M1 limitations still open

- Chat responses do not invoke deterministic engineering tools or CAD/FEA workers. The Engineering Core interaction panel remains separate.
- Live model-provider behavior, production credential availability, model-quality benchmarking, cost per accepted answer and production latency must be measured independently.
- Chat is not a general-purpose engineering agent and must not claim formal validation, evidence persistence or approval from its text response.

## Shaft-design reliability improvement — PILOT

The shaft-design reliability work adds a deterministic static-yield calculation, a regression fixture for the corrected multi-turn 15 kW shaft case, a versioned state stored in the existing project workspace, idempotent calculation persistence, and a read-only server-loaded design-state context for chat. The Analysis workspace exposes the typed input form and displays the saved state, artifact lineage, stress results and limitations. Unsaved form edits and stale workspace revisions are explicitly labelled.

Acceptance still requires CI on the exact pull-request SHA, authenticated preview testing with a disposable project, persistence/reload and idempotent-replay checks, and deployment verification. The capability remains PILOT until those gates pass. Chat remains conversational and cannot execute or persist the shaft calculation itself.

## Next milestones

| ID | Milestone | Status | Main exit gate |
|---|---|---|---|
| M2 | Shared artifact contracts, viewer registry, renderer benchmark and interactive CAD visualization | NEXT / PLANNED | Selected renderer passes the documented benchmark; supported canonical artifacts and display derivatives render with source lineage, authorization and stale-revision handling; viewer failure cannot change canonical validation state. |
| M3 | FEA mesh and result-field visualization | PLANNED | Supported mesh/field fixtures render with correct source values, units and legends; malformed or incomplete data fails closed; convergence and engineering review remain distinct. |
| M4 | Typed P&ID/PFD data model and viewer | PLANNED | Diagram IDs and connectivity round-trip; references are authorized; unsupported symbols/invalid connections are explicit. |
| M5 | Additional artifact viewers and one evidence-backed provider pilot | DEFERRED | A concrete user need, measured outcome, provider/license review, benchmark, independent validator, runtime isolation and rollback plan exist. |

## Geometry foundation and kernel-adapter direction

Adopt an **OCCT-first hybrid**:

- OCCT is the initial geometry-kernel direction for exact BREP and topology operations, geometry import/inspection and tessellation. The existing OCCT validator remains a narrow, independently controlled validation provider; it does not imply complete import/export coverage.
- Retain build123d as the current bounded authoring provider. Evaluate CadQuery, FreeCAD and Onshape as independent providers only where specific user workflows justify them.
- Put a product-owned engineering geometry/domain model above kernel adapters. It owns engineering identity, revisions, provenance, units, coordinate frames, feature/operation metadata, constraints and relationships to requirements, artifacts and validation.
- Define kernel conformance fixtures for import/export round trips, topology validity, dimensions, volume, units, tolerances, coordinate transforms and stable reference mapping.
- Review exact source revision, bindings, licenses, notices, maintenance, packaging and deployment constraints before adopting OCCT.js/OCP or another binding in a runtime.
- Build a proprietary geometry platform with progressive kernel ownership. First complete G0: audit existing `src/cad`, `src/artifacts`, `src/providers`, `src/execution` and `worker/cad` contracts and tests. Do not add parallel artifact identity, persistence, viewer registry or CAD execution paths.
- Retain OCCT as the initial exact-geometry provider and build123d as the bounded authoring provider. Develop native algorithms incrementally and promote each only after differential, numerical, adversarial, regression and resource conformance gates pass.
- Keep the first implementation in this repository. Consider extraction only after stable APIs, independent versioning/CI, conformance coverage and a real external consumer exist.
- See [Proprietary Geometry Platform ADR](architecture/adr-2026-11-08-proprietary-geometry-platform.md) and [Geometry Platform Charter](geometry-platform/README.md).

Canonical geometry is distinct from renderer-facing tessellation. Display derivatives carry source ID/revision/digest, conversion provider/version and tessellation parameters. Geometry validation must identify the exact bytes tested. STEP/STL/3MF exports are not validated merely because a related BREP passed a check.

## Integrated engineering workspace strategy

The product is a modular workspace across six connected capability domains:

1. **Engineering intelligence:** intent, reasoning, bounded planning and project context.
2. **CAD and geometry:** part/assembly workflows, interchange, topology and design constraints.
3. **CAE and simulation:** structural, thermal, fluid and multibody analyses.
4. **Physical perception:** point clouds, inspection and Scan-to-CAD.
5. **Manufacturing and industrial systems:** DFM, process planning, quality, maintenance and reliability.
6. **Engineering data and lifecycle:** artifacts, BOMs, revisions, requirements, evidence and approvals.

They share project identity, authorization, typed capabilities, task state, artifact contracts, execution boundaries, validation and evidence. Each domain remains modular and is added only after workflow-specific acceptance; this is not a commitment to implement all domains in parallel.

### Product capability roadmap (V2.x)

| Version direction | Capability target | Main technology candidates |
|---|---|---|
| V2.0 | Bounded autonomous engineering workspace | Existing Engineering Core, typed task plans, deterministic providers, artifact-aware orchestration, risk gates and human approval |
| V2.1 | Multi-CAD interoperability | OCCT, build123d, CadQuery, FreeCAD and Onshape adapters |
| V2.2 | Physical perception and Scan-to-CAD | Open3D, point-cloud inspection, registration and traceable geometry reconstruction |
| V2.3 | Advanced CFD | OpenFOAM and independently validated simulation workflows |
| V2.4 | Multibody dynamics and robotics | MuJoCo, Menagerie and evaluated dynamics providers |
| V2.5 | Electromechanical systems | KiCad, SKiDL and SPICE integrations |

M2 artifact/viewer foundations are a prerequisite for workflows that must inspect, relate and reuse engineering artifacts. V2.0 expands existing bounded orchestration; it must not become unrestricted model-driven execution. V2.1–V2.5 remain target directions, not implementation or release claims.

Physical perception remains a separately staged roadmap path: the current Open3D worker is a one-shot prototype. Before product integration it needs authenticated upload, private project storage, known-transform/noise/outlier fixtures, provenance, limits and human review.

## M2 — Shared artifact and CAD visualization foundation (NEXT)

**Decision state:** the product strategy is an integrated engineering workspace; the initial geometry direction is OCCT-first hybrid; the primary 3D renderer remains undecided pending benchmark. This milestone adds the shared viewer foundation without changing the existing Engineering Core execution/validation boundaries.

### M2 work sequence

1. **Audit existing contracts.** Reconcile current CAD model/completion records, artifact bridge, storage metadata, execution records, evidence receipts and project workspace types. Reuse or evolve existing contracts; do not create a parallel artifact identity or registry.
2. **Define the artifact/display-derivative relationship.** Identify artifact ID/type/format/schema, project and source-object identity, source revision and digest, producer/provider and runtime version, units, coordinate frame, storage key, validation receipt, limitations and conversion lineage. Add derivative kind, source digest, converter/kernel version and tessellation settings where relevant.
3. **Define a trusted viewer registry.** Resolve renderer/reader choice from server-approved artifact metadata and supported-format policy, never a browser-supplied MIME type or file extension alone. Unknown, malformed, stale or unsupported formats must return explicit safe states.
4. **Define renderer adapter contract.** Keep scene lifecycle, camera/navigation, object visibility, selection, clipping, material/field overlays and resource disposal behind a renderer-neutral interface. Do not expose Babylon.js or Three.js types to canonical artifact, Engineering Core or validation contracts.
5. **Benchmark Babylon.js vs Three.js.** Build equivalent prototypes using the same pre-tessellated datasets, visual quality, browser/device, camera and interaction scripts. WebGL 2 is the initial compatibility baseline. Treat WebGPU as a separately measured future backend, not a WebGPU-only launch requirement.
6. **Define the OCCT geometry adapter.** Reuse the existing OCCT validation boundary; evaluate exact-version OCCT/OCP bindings for import, topology access and tessellation. Verify licensing, packaging, WASM/native runtime compatibility, worker isolation, memory/time limits and deterministic fixtures before promoting a binding/runtime.
7. **Build the CAD MVP.** Begin with bounded, known-good BREP/STEP/STL fixtures and generated display derivatives. Add 3MF only after object/material/build metadata handling is tested. Add assembly hierarchy and stable face/edge-to-topology mapping only where the source converter can preserve reliable references.
8. **Add the separate 2D drawing path.** Define independent PDF, SVG and DXF readers, layers, coordinate units, annotations and measurement semantics. DWG is out of scope until an appropriately licensed and validated route is selected.
9. **Complete secure artifact access.** Keep storage private, perform server-side project authorization, use short-lived signed URLs, validate file size/content, isolate conversion workers and prevent path/network escape. Viewer or conversion errors must not mutate canonical artifact validation state.
10. **Prove stale-state behavior.** When a source model revision changes, mark its derivatives, dependent meshes and simulation results stale; never silently present an earlier result as current.

### M2 exit gates

- One canonical artifact identity and project authorization path is reused; no duplicate registry is introduced.
- Canonical bytes are checksum-bound and remain immutable for a given artifact revision.
- Every display derivative is bound to the exact source ID/revision/digest and conversion settings.
- Unsupported, malformed, oversized and malicious inputs fail safely with no forged or promoted validation state.
- The selected renderer meets the benchmark thresholds on the same fixtures and devices; the scorecard, raw runs and decision are retained.
- Core navigation, selection and visibility work on target desktop and representative Android browsers, including resource disposal and context-loss recovery.
- Engineering-grade measurements are computed from canonical geometry or another declared deterministic authority, not guessed from display triangles.
- Authenticated browser acceptance uses the dedicated non-production project and exact candidate revision.
- Existing CAD/OCCT regression and evidence acceptance still pass.



## Renderer benchmark protocol

The benchmark selects one primary CAD 3D renderer; it does not select a geometry kernel or a scientific field renderer.

### Equivalent test workloads

- **Parts and meshes:** single BREP-derived parts, STL meshes and dense triangulations at multiple sizes.
- **Assemblies:** increasing component counts and repeated instances (target fixture tiers such as 100, 500, 1,000 and 5,000 where the fixture and device make the tier meaningful).
- **CAD interaction:** orbit/pan/zoom, fit-to-view, object visibility, face/edge picking, selection highlighting, clipping/section planes, exploded-state display and measurement overlays.
- **CAE overlays:** displacement and scalar/vector field fixtures to test interoperability, not to assume the CAD renderer is the final CAE renderer.
- **Mobile:** representative Android Chromium/browser devices, memory pressure, long-session stability, touch interaction, page visibility changes and GPU-context loss/recovery.

Both implementations must receive identical already-tessellated input and equivalent rendering settings. Do not include STEP parsing in one renderer's timing and exclude it from the other's. Geometry conversion time is measured separately.

### Measurements and scorecard

| Criterion | Weight |
|---|---:|
| Large-assembly frame-time stability and throughput | 20% |
| Android/mobile stability and recovery | 20% |
| Picking/selection correctness and latency | 15% |
| Memory growth and resource disposal | 15% |
| Visual quality and clipping/material parity | 10% |
| Initial bundle impact and first-render/load time | 10% |
| Maintainability, testability and required CAD integration effort | 10% |
| **Total** | **100%** |

Record device/browser/OS/GPU, engine and dependency versions, test fixture digest, rendering settings, warm/cold conditions, frame-time distributions (including high-percentile values), memory observations, picking accuracy, load timings, errors, context-loss recovery and repeated-run variance. Publish raw results and explain unavailable metrics rather than inventing them.

Thresholds must be declared before scoring. Weighting is a decision aid, not a substitute for minimum gates: correctness, no data leakage, bounded resource use, responsive interaction and reliable recovery are mandatory. A renderer that fails a minimum gate is not selected even if its weighted score is higher. If the scores are close, prefer the lower-maintenance engine with the strongest required integration fit. Do not keep both as permanent application dependencies without a demonstrated need.

### Benchmark deliverables

- Isolated side-by-side prototype or equivalent harness.
- Identical model fixtures and replayable interaction scripts.
- Reproducible run instructions and device matrix.
- Raw measurements, scorecard and limitations.
- Accepted renderer ADR update naming the selected engine and version range, or a recorded decision to defer selection.

## M3 — FEA visualization work

1. Define accepted mesh/result formats for the Gmsh/CalculiX reference path.
2. Evaluate VTK.js and a normalized result format against known fixtures before selecting the browser reader.
3. Display units, legends, field locations, solver/version, convergence status and known limitations.
4. Keep execution integrity, numerical validation, mesh convergence and engineering approval as distinct states.
5. Test invalid topology, non-finite results, missing fields, unit mismatch, oversized files and conversion failures.

## M4 — P&ID/PFD visualization work

1. Define a typed diagram schema for equipment, ports, line segments, connectivity, flow direction, tags, layers, coordinate/layout data, schema version and source revision.
2. Build an accessible SVG/canvas renderer with pan/zoom, fit-to-view, element selection and tag search.
3. Validate connectivity and identifiers before labeling a diagram accepted.
4. Keep standards compliance explicit; do not claim compliance until the applicable symbol/drafting rules and fixtures are implemented and reviewed.

## Non-negotiable release gates

- Use a feature branch and pull request; do not push application changes directly to `main`.
- Run `npm ci`, `npm test`, `npm run build`, `npm run architecture:graph -- --strict`, worker checks and the relevant Playwright acceptance on the exact candidate revision.
- Run authenticated browser acceptance only against the dedicated non-production Supabase project, disposable test accounts and exact allowlisted preview deployment host.
- Check the exact Vercel deployment and separate worker revisions/readiness before enabling a production capability.
- Do not replay ambiguous mutations without checking idempotency/completion state.
- Do not claim user productivity, time savings, accuracy or ROI without matched real-world measurement.

See [Architecture](architecture.md), [Engineering Capabilities](engineering-capabilities.md), [Playwright Runbook](playwright-e2e.md) and [Product Doctrine](product-doctrine.md).

## Chat context and geometry-based shaft intent repair — 1 November 2026

Production request logs showed long-running project chat submissions being rejected at the fixed 24,000-character context limit before the model provider was called. The chat route now retains a recent bounded history, removes oldest complete turns (and trims oversized older messages with an omission marker), preserves the latest user message, and logs the omitted counts. A too-large newest message is still rejected explicitly. The model is told when older history was compacted.

The Engineering Core shaft completion contract now accepts bearing span, gear position, pitch diameter and pressure angle and derives the gear forces and maximum bending moment. It no longer requires a user-supplied bending moment. Material strengths and design factor are explicit. The implemented deterministic criterion remains the preliminary von Mises static-yield pilot, not the ASME elliptic criterion requested in some prompts. It does not produce verified evidence or human approval. Regression tests cover the screenshot's shaft geometry scenario and long-history chat requests.