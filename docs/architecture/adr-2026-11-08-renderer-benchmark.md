# ADR — Renderer abstraction and Babylon.js vs Three.js benchmark

- **Status:** Accepted — benchmark and abstraction strategy. Production renderer selection is deferred.
- **Decision date:** 8 November 2026
- **Owners:** Engineering platform architecture
- **Scope:** Interactive browser-based 3D CAD/model visualization.

## Context

The Engineering Workspace needs an interactive 3D viewport for CAD parts, assemblies, geometry inspection and selected engineering overlays. The current repository has a bounded build123d CAD-generation path and independent OCCT BREP validation, but does not yet have a shared artifact/viewer registry or a complete browser CAD viewer.

Babylon.js and Three.js are both credible browser 3D engines. Their general graphics capabilities do not establish which performs better for our specific CAD workloads. Neither library is the authoritative CAD geometry kernel, and neither should own artifact identity, geometry validation or solver execution.

## Decision

1. **Do not select the production renderer yet.** Benchmark Babylon.js and Three.js using equivalent engineering workloads and retain the raw results and decision record.
2. Use **WebGL 2** as the initial browser compatibility baseline for the benchmark and first viewport implementation.
3. Evaluate **WebGPU** as a future backend or enhancement only after browser/device coverage, stability, rendering parity and measured workload benefit are demonstrated. WebGPU-only support is not a launch requirement.
4. Define a **renderer-neutral adapter** for scene lifecycle, camera/navigation, visibility, selection, clipping, material/field overlays and resource disposal.
5. Keep file parsing, canonical geometry, geometry processing, artifact storage, measurements, validation, evidence and task state independent of Babylon.js and Three.js.
6. Select one primary renderer after minimum correctness, security, performance and mobile stability gates pass. Do not ship both as permanent dependencies without a demonstrated requirement.

## Options considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| Three.js only | Broad ecosystem, flexible rendering abstractions and existing CAD-adjacent integrations | Selection of engine before testing our mobile/assembly workload would be premature | Retain as benchmark candidate |
| Babylon.js only | Integrated engine facilities for scene inspection, picking, optimization and rendering | Must establish CAD integration fit, bundle/memory behaviour and maintenance cost on our fixtures | Retain as benchmark candidate |
| Raw WebGL implementation | Maximum low-level control and no engine abstraction | High implementation and maintenance cost for scene, materials, cameras, picking and recovery | Reject for initial product |
| Ship both renderers | Allows different viewport paths | Duplicated dependencies, tests, behaviour and support burden without proven need | Reject unless a later measured use case requires it |
| WebGPU-only renderer | Access to newer graphics and compute capabilities | Browser/device coverage and fallback constraints make it unsuitable as the initial baseline | Defer |

## Benchmark protocol

Both candidates must receive identical already-tessellated geometry, camera state, visual quality, browser/device, and replayed interaction scripts. STEP parsing or OCCT tessellation time must be measured separately from renderer performance.

Workloads:
- Single parts and dense mesh fixtures at multiple sizes.
- Assemblies with increasing component counts and repeated instances.
- Orbit, pan, zoom, fit-to-view and visibility toggling.
- Face/edge picking, highlighting and selection-to-topology mapping where available.
- Section/clipping planes, exploded states and measurement overlays.
- Scalar/vector engineering field overlays as an interoperability test.
- Representative Android/mobile browsers, long sessions, touch input, memory pressure and GPU context loss/recovery.

Scorecard:

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

The scorecard is a decision aid, not a substitute for minimum gates. Thresholds must be declared before scoring. Record high-percentile frame times, repeated-run variance and observed memory behaviour rather than relying only on average FPS. Any engine that fails correctness, isolation, mobile stability or recovery gates is disqualified regardless of aggregate score.

## Consequences

### Positive
- Avoids premature dependence on a renderer before workload evidence exists.
- Preserves the ability to change rendering technology without rewriting CAD parsing or geometry processing.
- Makes mobile stability and engineering interaction first-class acceptance criteria.
- Prevents the graphics engine from becoming an accidental source of engineering truth.

### Negative / costs
- Requires a benchmark harness and equivalent adapters before final selection.
- The abstraction may initially limit access to engine-specific features; justified extensions must remain behind optional adapter capabilities.
- Supporting WebGL 2 first may defer some WebGPU-specific optimizations.

## Follow-up actions

1. Define representative canonical CAD fixtures and deterministic display-mesh exports.
2. Build an isolated Babylon.js and Three.js comparison harness.
3. Add frame-time, memory, picking, load and recovery instrumentation.
4. Test desktop and representative Android devices.
5. Publish results, limitations and selected version range in a superseding/implementation ADR.
6. Keep Babylon.js, Three.js and WebGPU as candidates until the benchmark is accepted.

## Related documents

- [Architecture](../architecture.md)
- [Implementation Plan — M2 and renderer benchmark](../implementation-plan.md)
- [Engineering Ecosystem Registry](engineering-ecosystem-registry.md)
- [Engineering Capabilities](../engineering-capabilities.md)
