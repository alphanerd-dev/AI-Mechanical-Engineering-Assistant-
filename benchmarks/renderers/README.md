# CAD renderer benchmark harness

This harness compares pinned Babylon.js and Three.js builds without adding either package to the application bundle.

- Babylon.js `@babylonjs/core 9.35.0` — Apache-2.0; loaded as a version-pinned ESM bundle from esm.sh.
- Three.js `three 0.187.0` — MIT; loaded as a version-pinned ES module from jsDelivr.
- WebGL 2 is mandatory. A browser without WebGL 2 is rejected rather than silently compared on a different backend.
- Both engines receive the exact same deterministic, pre-tessellated shaft/flange/fastener assembly mesh. The fixture SHA-256, vertex count, triangle count and component count are included in the exported result.
- The workload repeats that assembly using Babylon thin instances and Three `InstancedMesh`; the centre assembly is fixed to make picking comparisons repeatable.
- Each run automatically executes five paired trials and alternates which renderer runs first.
- The harness records initialization, first render, frame-time percentiles, pick latency and hit accuracy, visibility toggles, available JS heap deltas, WebGL context-loss events and synthetic context restoration.
- Raw frame intervals and pick latencies are retained in the JSON export. GPU vendor/renderer and device/browser metadata are included where the browser exposes them; unavailable metrics remain null rather than being invented.

## Run

The committed static page is served by Next.js at `/benchmarks/renderers/`. Select a workload and run the benchmark; after all five paired trials complete, export the JSON. Both engine bundles are external, version-pinned CDN resources, so the benchmark requires network access.

Run each workload on:
- a representative desktop Chromium device;
- an Android mid-range device;
- a lower-memory Android device;
- Safari/WebKit where it is a supported product target.

Record device model, OS, browser version, GPU, power mode, thermal state, device pixel ratio, test date and raw JSON. Avoid comparing results from different devices or browser builds. Keep each workload's fixture SHA and engine versions unchanged across the paired run.

## Interpretation and limitations

This remains a renderer microbenchmark, not final production CAD acceptance. The shaft/flange/fastener mesh is a deterministic synthetic fixture, not a product-generated BREP/STEP/GLB artifact. It does not test STEP/BREP import, OCCT tessellation, stable face/edge topology mapping, calibrated measurement, section-plane correctness, real large-assembly constraints or long-duration Android thermal throttling. The context-loss test uses `WEBGL_lose_context`; it verifies the renderer's restoration path but does not reproduce every OS/GPU-driven context-loss scenario. Heap metrics may be unavailable or incomplete in browsers that mask `performance.memory`.

Do not select the product renderer from this harness alone. Final selection still requires representative product-derived part/assembly fixtures, paired physical desktop and Android runs, clipping/sectioning and selection correctness, resource-disposal checks, context-loss recovery, raw result retention and an accepted renderer ADR. If physical evidence is unavailable or a mandatory gate fails, defer selection.

No renderer selection is encoded in this harness. The production decision remains deferred.
