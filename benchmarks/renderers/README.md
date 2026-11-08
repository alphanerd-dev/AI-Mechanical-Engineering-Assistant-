# CAD renderer benchmark harness

This harness compares pinned Babylon.js and Three.js builds without adding either package to the application bundle.

- Babylon.js @babylonjs/core 9.35.0 — Apache-2.0.
- Three.js three 0.187.0 — MIT.
- WebGL 2 is mandatory. A browser without WebGL 2 is rejected rather than silently compared on a different backend.
- Both engines render the same repeated unit-box fixture using native instance batching (Babylon thin instances / Three InstancedMesh).
- The test samples orbit interaction and centre picking, and records initialization, first-render, frame-time distribution and available heap data.

## Run

The committed static page is served by Next.js at /benchmarks/renderers/. Select a workload and export the JSON. External engine modules load from jsDelivr; the benchmark therefore requires network access.

Run at least five paired trials per workload; the harness alternates which renderer runs first between successive runs. Repeat on:
- a representative desktop Chromium device;
- an Android mid-range device;
- a lower-memory Android device;
- Safari/WebKit where it is a supported product target.

Record OS, browser version, GPU, device model, power mode, thermal state, device pixel ratio, test date and raw JSON. Avoid comparing results from different devices or browser builds.

## Interpretation

This is an early renderer microbenchmark, not a production CAD acceptance test. It does not load STEP/BREP, tessellate OCCT solids, test topology mapping, measure memory reliably on all browsers, or emulate long-duration Android thermal throttling. Do not use its result alone to select the product renderer. Add representative part/assembly fixtures, clipping, sectioning, selection accuracy, resource disposal and context-loss recovery to the benchmark matrix before promoting an engine.

No renderer selection is encoded in this harness. The production decision remains deferred until paired runs and mandatory correctness/mobile gates are reviewed.
