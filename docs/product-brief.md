# Product Brief — AI Mechanical Engineering Assistant

**Product direction:** AI-native Engineering Workspace evolving toward an Engineering Operating System  
**Initial domain:** Mechanical Engineering  
**Reviewed:** 21 November 2026

## 1. Vision and promise

Turn engineering intent into usable, traceable outcomes with less avoidable manual work and rework.

An engineer should be able to describe a problem, discuss it with a conversational assistant, provide missing inputs, run an explicitly supported engineering task, and understand what was calculated, executed, checked and left for human decision.

The product starts with Mechanical Engineering and uses provider-neutral engineering contracts so more domains can be added without replacing the core.

**Product strategy:** an integrated, modular engineering workspace spanning engineering intelligence, CAD/geometry, CAE/simulation, physical perception, manufacturing/industrial systems and engineering data/lifecycle. These domains share identity, projects, capability contracts, artifact lineage, execution controls, validation and evidence; they do not need to ship simultaneously.

**Core rule:** AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.

A generated answer, completed worker process, stored file or rendered visualization is not by itself proof of engineering correctness.

## 2. Primary user experience

### Current implementation

The current application exposes two distinct paths:

1. **Conversational assistant:** a project-scoped chat for explanation, problem framing, conceptual discussion, comparison, missing-input identification and ordinary analytic calculations. It streams responses and renders Markdown, code and engineering equations.
2. **Engineering Core:** a separate user-facing task surface for registered deterministic workflows that require typed inputs, authorization, execution, validation, evidence and a decision state.

This is the current repository behavior. The chat route does not yet submit privileged engineering tasks, execute CAD/FEA, run arbitrary Python/shell, mutate project state or formally validate a result. The separate Engineering Core is the current execution entry point.

### Target experience

Make the **conversation the default entry point and primary user-facing task journey**. The engineer should be able to begin with an unscoped or project-scoped objective, discuss it, attach relevant inputs, and let the assistant coordinate a supported workflow without first choosing an internal capability module.

For executable engineering requests, the target journey is:

1. Interpret the objective and retrieve only authorized project context.
2. Ask focused questions for missing or ambiguous critical inputs.
3. Propose a typed, versioned TaskSpec describing capability, parameters/units, assumptions, inputs, dependencies, outputs, acceptance criteria, resource limits and risk.
4. Validate that proposal using host-owned schema, project authorization, capability readiness, policy and approval rules.
5. Persist the task and dispatch only an allowlisted deterministic capability to an isolated worker.
6. Stream durable progress, blockers, approval requests and recovery state into the originating conversation.
7. Independently validate outputs, bind them to immutable artifacts/evidence and present the result with its exact limitations and next action.

The user-facing surface should be coherent, but **execution authority must remain separate internally**: chat/model output is advisory; the authenticated control plane, Engineering Core, capability policy, durable store, workers and validators own execution and acceptance. CAD editing, simulation post-processing, drawing inspection, requirements and approval screens remain contextual specialist surfaces rather than competing global destinations.

### Primary navigation direction

The proposed global structure is **Chat, Projects, Tasks, Library and Account**. Tasks is the cross-project monitor for queued, running, completed, failed, blocked and approval-required work, with a link back to its originating conversation. Within a project, keep Conversation primary and expose Context, Results, Activity/Decisions and Project settings as contextual views. On mobile, chat remains full-width; context, result inspection and approval open as full-screen sheets.

Do not expose backend-only reasoning workbenches, completion units, capability registries, provider IDs, worker diagnostics, raw route names or internal enum/UUID values to ordinary users. Show engineering-relevant values, units, assumptions, solver details, mesh quality, validation and evidence through progressive disclosure.

## 3. Conversational AI implementation

The current chat stack is:

- assistant-ui for the conversation interface and client-side thread controls.
- Vercel AI SDK for streaming and the UI-message stream transport.
- The official AI SDK Google provider for Gemini chat.
- Streamdown for Markdown, with the code plugin, math plugin and KaTeX.
- Next.js server routes for authentication, project authorization, request validation, model configuration and streamed response handling.
- Existing project-scoped conversation/session APIs for history and thread identity.

The default chat model in the current route is `gemini-3.5-flash-lite`. The server-side model name and API key are configured through the engineering reasoning model environment variables. The browser cannot choose a provider, model, system prompt or tool configuration.

The separate structured-reasoning workbench uses a host-owned OpenAI-compatible HTTP transport. It is not the same transport as the current Gemini chat route; see [Model Provider Stack](reasoning-model-provider-stack.md).

## 4. Target users and workflows

Initial users include engineering students, design and analysis engineers, simulation practitioners and reviewers who need to move from a problem statement to a defensible result with less coordination overhead.

A user should be able to:

1. State a problem naturally and refine it through a multi-turn project conversation.
2. Reuse authorized project context and provide material missing inputs when requested.
3. Ask for supported calculations, CAD operations, mesh generation or simulations through explicit Engineering Core workflows.
4. Inspect supported engineering artifacts with clear source, revision and evidence information.
5. Ask follow-up questions about a result and return to relevant project history.
6. Review assumptions, units, validation status, evidence, limitations and next action.
7. Recover from interrupted operations and persistence failures without losing work or duplicating non-idempotent actions.

## 5. Current capability boundary

The repository includes the workspace/authentication/persistence foundation, project-scoped streamed chat, structured intent/reasoning paths, deterministic calculation pilots, bounded CAD authoring and OCCT processing, strict GLB validation, a read-only CAD viewport, PDF/SVG/ASCII-DXF drawing ingestion/preview, immutable project-scoped geometry revisions and atomic audit lineage. The manufacturing readiness pilot now has durable assessment snapshots and independent append-only human decisions. Reference/pilot FEA execution and a bounded OpenFOAM 14 laminar benchmark worker/provider are present. An isolated Open3D inspection/registration prototype remains disconnected from public scan upload and production perception.

The following remain planned or bounded: production renderer selection, FEA mesh/result-field visualization, structured P&ID/PFD authoring/viewing, authenticated point-cloud upload/persistence, general assembly/feature CAD, broad CAD-to-CAE workflows, general-purpose CFD, durable app-level CFD execution. Chat-driven privileged engineering tool execution remains disabled.

A catalog entry or adapter does not prove that a provider is installed, licensed, reachable, live-accepted or production-ready. Capability maturity is documented in [Engineering Capabilities](engineering-capabilities.md).

## 6. Artifact and evidence contract

Every engineering artifact should identify, as applicable:

- Artifact ID, type, format, schema version and source revision.
- Project/source-object identity and originating job/operation.
- Provider/runtime version, input assumptions, units and coordinate frame.
- Private storage reference and integrity checksum.
- Validation outcome, validator identity/version, evidence/receipt references, warnings and known limitations.
- Related artifacts, requirements and authorized reviewer decisions.

Display derivatives must reference their canonical artifact and conversion provenance. The workspace must not silently display a stale simulation as current after its source CAD or inputs change.

Use existing project-scoped authorization, private storage and evidence mechanisms. Authorize artifact access server-side, expire signed access links and treat uploaded content and conversion inputs as untrusted.

## 7. Geometry and visualization direction

### Renderer decision

The production 3D renderer remains **unselected** pending paired desktop/Android workload benchmarks and authenticated acceptance. Benchmark Babylon.js and Three.js against identical engineering workloads before choosing one. Use WebGL 2 as the initial browser compatibility baseline; evaluate WebGPU as a later backend/upgrade when device support, stability and measured benefit justify it. Keep a renderer adapter so CAD parsing, geometry processing, artifact identity, validation and evidence are independent of the selected renderer. Do not ship both engines permanently unless a measured requirement demands it.

The benchmark must cover single parts, dense meshes, assembly scale, picking/selection, measurements, section planes, exploded views, simulation-field overlays, browser/mobile stability, memory use, frame-time distribution, load time, context-loss recovery and maintainability. The scorecard and exit gates live in the [Implementation Plan](implementation-plan.md).

### Geometry decision

Adopt an **OCCT-first hybrid geometry foundation**:

- OCCT is the initial geometry-kernel direction for exact BREP/topology operations, import and geometry processing, subject to exact-version, binding, license, packaging and runtime acceptance.
- Retain the existing bounded build123d CAD generation path. Evaluate CadQuery, FreeCAD and Onshape as separate providers where there is a demonstrated workflow need.
- Build a product-owned engineering geometry/artifact abstraction above kernel adapters. It owns stable engineering identity, revisions, units, coordinate frames, provenance, feature/operation metadata and validation relationships—not the kernel's geometric algorithms.
- Keep canonical CAD artifacts separate from tessellated display derivatives. Every derivative carries source ID/revision/digest and conversion/tessellation metadata.
- Build a proprietary engineering geometry platform with progressive kernel ownership. The platform owns stable engineering contracts, feature semantics, constraints, provenance and validation relationships; OCCT remains the initial mature geometry provider while native algorithms are developed incrementally.
- Do not attempt immediate full replacement of OCCT. Every native operation must pass shared differential, numerical, adversarial and performance conformance gates before promotion.

### Visualization domains

- **CAD 3D:** Babylon.js/Three.js benchmark; one production renderer selected after evidence.
- **FEA/scientific fields:** evaluate VTK.js independently against supported Gmsh/CalculiX result fixtures. The CAE viewer need not share the CAD renderer.
- **Drawings:** separate 2D rendering subsystem for PDF, SVG and DXF initially; DWG requires a separately reviewed route.
- **Point clouds:** separate perception data model and Open3D processing path.

A viewer does not execute a solver. Rendering is not geometry validation, numerical validation, mesh convergence, physical adequacy or approval. A display mesh is never silently promoted to canonical engineering geometry.

## 8. Trust and decision states

Keep candidate result, execution, validation, verification and approval distinct:

- PROPOSED / CALCULATED
- EXECUTED
- VALIDATED
- VERIFIED
- WAITING_APPROVAL
- NEEDS_INPUT / BLOCKED / UNSUPPORTED / FAILED

The exact state vocabulary depends on the capability contract. Do not display checks as passed when they did not run, invent evidence references or collapse a blocked operation into success.

## 9. Success measurement

The primary economic metric is total cost per accepted engineering outcome, including engineer labour, model/provider/tool execution, review, rework, integration and operating costs.

Time-to-first-accepted-result, net engineering time saved, cost per accepted outcome, validation completeness, recovery quality and repeat use should be measured on comparable real tasks. The repository's outcome baseline remains **NOT MEASURED** until matched real-user trials exist. Browser test duration and fixture values are not productivity evidence.

## 10. Product capability roadmap

The hybrid strategy is phased. Cross-cutting delivery milestones M2–M5 in the [Implementation Plan](implementation-plan.md) define the artifact/viewer, CAD, CAE and diagram foundations; the following V2.x labels describe product capability evolution and are not claims of completed releases.

| Product direction | Capability target | Intended technology direction |
|---|---|---|
| V2.0 | Bounded autonomous engineering workspace | Existing Engineering Core, typed plans, deterministic providers, artifact-aware orchestration, risk gates and human approval |
| V2.1 | Multi-CAD interoperability | OCCT, build123d, CadQuery, FreeCAD and Onshape adapters |
| V2.2 | Physical perception and Scan-to-CAD | Open3D, point-cloud inspection, registration and traceable geometry reconstruction |
| V2.3 | Advanced CFD | OpenFOAM and independently validated simulation workflows |
| V2.4 | Multibody dynamics and robotics | MuJoCo, Menagerie and evaluated dynamics providers |
| V2.5 | Electromechanical systems | KiCad, SKiDL and SPICE integrations |

M2's artifact and viewer foundations should precede broad multi-step autonomous workflows that rely on inspecting and linking engineering artifacts. V2.0 should expand in bounded, capability-specific increments rather than enabling unrestricted agent execution. Later V2.x integrations require provider licensing, runtime isolation, representative benchmarks, independent validators, evidence contracts, rollback and demonstrated user value.

**Experience and adoption sequencing:** before expanding V2.x breadth, close the chat-to-task orchestration gap, establish one durable task/event/result lifecycle, add secure chat attachments and project file retrieval, complete at least one accepted CAD workflow and one bounded FEA workflow, then consolidate navigation, administrator-only settings and accessibility. In parallel, validate the proposed Mechanical Design Verification Workspace entry point with real engineers; it remains a customer-discovery hypothesis, not a validated market decision.

## 11. Acceptance rule

A feature is ready only when its declared user task, supported scope, usability, security, failure recovery, validation/evidence boundary and economics have been assessed. Tests must prove only the guarantees they actually exercise. See [Product Doctrine](product-doctrine.md), [Architecture](architecture.md) and [Implementation Plan](implementation-plan.md).
