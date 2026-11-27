# Architecture and Trust Boundaries

**Reviewed:** 21 November 2026  
**Status:** Current repository architecture. Production readiness is a separate release and runtime decision.

See the [Product Brief](product-brief.md) for product scope, the [Engineering Capabilities](engineering-capabilities.md) for maturity boundaries, the [Implementation Plan](implementation-plan.md) for milestones and the [architecture decision records](README.md#architecture-decision-records) for accepted architectural direction.

## Product invariants

- **AI coordinates. Engineering tools execute. Independent checks assess. Evidence records. Engineers approve.**
- **Fast by default. Rigorous when it matters. Explicit when risk increases.**
- **Never claim success without evidence.**

A plausible model response, successful process exit, stored artifact or rendered visualization is not proof of engineering validity.

## System view

Engineering user  
→ Next.js Engineering Workspace (project context, conversational chat, task surfaces and artifact views)  
→ authenticated Next.js server routes  
→ Engineering Core (typed intent, state, project context, capability and risk policy)  
→ capability router  
→ deterministic providers and bounded workers  
→ independent validation and evidence/provenance  
→ authorized approval or next action.

Supabase supplies identity/session integration, project/workspace persistence and private artifact storage where configured. CAD, FEA, research, robotics and PLM systems remain separate provider/runtime integrations with their own licensing, deployment and acceptance gates.

## Geometry and visualization architecture

The product direction is an **OCCT-first hybrid geometry foundation**, a **renderer-neutral visualization layer**, and an **integrated engineering workspace**. The bounded CAD workspace now includes isolated OCCT BREP/STEP processing, source-bound display derivatives, strict GLB validation, a read-only viewport, drawing ingestion and G2 immutable geometry revision persistence. These delivered foundations do not imply a native proprietary kernel, complete multi-format coverage or general CAD/assembly support.

### Canonical geometry and display derivatives

Keep engineering geometry and its browser representation separate:

```text
Authorized source artifact
        |
        v
Format detection + artifact contract
        |
        v
Isolated geometry-processing worker
        |
        +----> Canonical engineering geometry
        |       (source bytes / native model / exact BREP as applicable)
        |
        +----> Tessellation + display manifest
                        |
                        v
             Renderer adapter (not selected yet)
                        |
                 WebGL 2 viewport
```

- The canonical source remains authoritative. A tessellated mesh is a display derivative, not a replacement for exact CAD geometry, design intent or the source file.
- Every derivative must bind to its source artifact ID, revision and digest, plus converter/kernel name and version, tessellation settings, units and coordinate frame.
- A source revision change invalidates or marks dependent derivatives, meshes and simulation results stale. Never silently show a previous result as current.
- Mapping a picked triangle or face back to a persistent CAD face/edge identifier requires an explicit topology map from the geometry processor. Screen-space picking alone is not stable engineering identity.
- Measurements must state units, coordinate frame, tolerance and whether they are evaluated against canonical geometry or an approximate display mesh. Engineering-grade measurements must use the canonical geometry service or another declared deterministic authority.

### Hybrid geometry strategy

- **Initial geometry foundation:** OpenCascade Technology (OCCT), using the existing independent OCCT BREP validation path and evaluating OCCT/OCP bindings for broader import, topology and tessellation workflows.
- **Authoring providers:** retain bounded build123d generation; evaluate CadQuery, FreeCAD and Onshape through provider adapters when their distinct workflows are justified.
- **Proprietary geometry platform:** build a product-owned, reusable geometry boundary above kernel adapters. It owns engineering identity/revisions, units, coordinate frames, tolerances, feature/operation semantics, constraints, provenance, artifact lineage and validation relationships. Audit and evolve existing `src/cad` and `src/artifacts` contracts; do not create a parallel registry or identity model.
- **Progressive kernel ownership:** retain OCCT as the initial mature exact-geometry provider and build123d as the existing bounded authoring provider. Develop native algorithms incrementally, beginning with mathematical primitives and robust measurements; progress to topology and solid operations only after differential/conformance tests pass.
- **Replaceable providers:** isolate kernel-specific calls behind versioned adapters. A native operation replaces an incumbent only after it passes the same reference fixtures, negative/degenerate cases, numerical tolerances, regression corpus and performance/resource gates.
- **Long-term independence:** the proprietary platform is approved as a strategic direction; a complete from-scratch kernel is not an immediate deliverable. See [Proprietary Geometry Platform ADR](architecture/adr-2026-11-08-proprietary-geometry-platform.md) and [Geometry Platform Charter](geometry-platform/README.md).

OCCT is the initial target, not a blanket assertion that all OCCT bindings, licenses, builds or runtime deployments have been approved. Pin and review the exact version, bindings, license obligations, packaging, resource limits and acceptance fixtures before promotion.

### Renderer strategy: benchmark before selection

Babylon.js and Three.js are the two candidates for the primary interactive 3D viewport. The production renderer is intentionally **not selected** by this decision.

- Use **WebGL 2** as the initial compatibility/performance baseline for the benchmark and browser viewport.
- Evaluate WebGPU as a future backend or enhancement after device/browser support, rendering parity, operational stability and actual workload benefit are demonstrated. Do not make WebGPU-only rendering a baseline requirement.
- Build a renderer adapter around scene creation, camera/navigation, selection, visibility, clipping, material/field display and resource disposal. Geometry parsing, canonical storage, task execution, validation and evidence must not depend on Babylon.js or Three.js.
- Benchmark both engines with identical tessellated source data, camera, rendering quality, hardware, browser, interaction scripts and memory/thermal conditions. Do not compare one engine's CAD import path against the other's already-tessellated display path.
- Required workloads include single parts, dense meshes, assemblies of increasing component count, face/edge selection, section planes, exploded views, measurement overlays, simulation fields and representative Android/mobile devices.
- Record first render and full load time, stable frame-time distribution (not only average FPS), memory growth, GPU resource use where observable, picking latency/accuracy, context-loss recovery, bundle impact and developer maintenance cost.
- Use the predeclared benchmark scorecard in the [Implementation Plan](implementation-plan.md). If results are close, prefer the lower-maintenance option with the strongest required CAD integration. Do not ship both renderers as permanent dependencies simply to avoid making a decision.

The viewer is an inspection and interaction surface. Rendering success does not establish geometric validity, solver correctness, mesh convergence, physical-model adequacy or engineering approval.

### Separate visualization domains

- **CAD 3D:** candidate Babylon.js/Three.js renderer behind the renderer adapter.
- **Scientific mesh and result fields:** evaluate VTK.js and normalized solver-result formats independently. Do not force FEA field visualization into the CAD renderer if VTK.js better represents the data and interactions.
- **Drawings and diagrams:** use a separate 2D subsystem for PDF, SVG and DXF, with pan/zoom, layers, annotations and declared measurement support. DWG requires a separately licensed/validated route.
- **Point clouds:** preserve a distinct perception representation and Open3D processing contract; do not turn a point cloud into a CAD solid by assumption.

### Browser and worker responsibility

The browser is responsible for authorized artifact presentation and responsive interaction, not unbounded CAD conversion or solver execution. Use isolated workers for untrusted uploads, format conversion, geometry validation and computationally expensive processing. Apply file-size, time, CPU, memory and output limits. Use adaptive detail/LOD, lazy loading, disposal and context-loss recovery for mobile and large assemblies.

## Conversational chat

The current chat is a real streamed application path:

- `components/EngineeringChat.tsx` provides the assistant-ui conversation interface and Vercel AI SDK runtime.
- `app/api/projects/[projectId]/engineering/chat/route.ts` is the server-owned streaming boundary.
- The route checks engineering authorization for the selected project, validates the message payload, rejects client-supplied provider/model/system/tool configuration, and uses server-side model settings.
- The current chat route uses the official AI SDK Google provider. Its default model is `gemini-3.5-flash-lite`; the model name can be overridden through server-side configuration. It is not currently a generic OpenAI-compatible chat endpoint.
- Chat history is project-scoped and reuses the existing engineering conversation/session APIs. The remote thread identity is the project ID; a different project has a different conversation.
- Streamdown renders Markdown and code; the Streamdown math plugin and KaTeX render equations. `src/chat/engineering-markdown.ts` normalizes LaTeX, formats standalone display equations as blocks, avoids rewriting fenced code and protects currency text.

The chat can explain engineering concepts, compare options, identify missing inputs and perform ordinary analytic calculations in the response. **It does not execute CAD, FEA, shell/Python code, privileged engineering tools, project mutations or formal validation.** The separate Engineering Core interaction panel is the explicit path for supported deterministic workflows. A chat answer is not an accepted engineering artifact.

The browser acceptance test deliberately intercepts the chat request with a deterministic streamed response. It proves the client transport, Markdown/math rendering, controls and responsive layout; it does not prove live Gemini credentials, model quality or live tool execution.

## Target user interaction and control boundary

### User-facing direction: task-oriented, conversation-enabled

The target product experience is organised around a durable engineering task and its review package. A user may start through a guided request or conversation, refine intent, attach supported source material, resolve missing inputs, authorize gated work, monitor progress and review checks/evidence without navigating disconnected internal modules. Conversation is an input and follow-up method, not the whole product.

This changes the **interaction layer**, not the trust architecture:

```text
Engineer
  -> Project-aware conversation
  -> Typed TaskSpec proposal
  -> Host schema / authorization / capability / risk checks
  -> Approval gate where required
  -> Durable task and job records
  -> Allowlisted deterministic worker
  -> Independent validation
  -> Artifact + evidence + approval state
  -> Result and contextual viewer returned to the conversation
```

The global navigation target is Chat/Request, Projects, Tasks, Library and Account. Chat/Request supports natural-language intake and clarification; the durable task remains inspectable independently. Project-scoped context, results, activity/decisions and settings should be contextual rather than parallel top-level engineering modules. Tasks provides a cross-project status monitor and a return link to the originating request. Specialist CAD/CAE/drawing/approval surfaces remain available when a workflow needs richer interaction.

### Current implementation boundary

The current chat is still guidance-oriented and does not invoke privileged engineering capabilities. The Engineering Core remains the separate submission path for registered deterministic workflows. Do not change this status statement until authenticated chat-to-task acceptance is completed on an exact release candidate. The audit's UX recommendations are target design decisions, not evidence that the interaction has shipped.

### State ownership and client framework decisions

Use one authoritative owner for each kind of state:

| State category | Owner / recommended tool | Boundary |
|---|---|---|
| Durable identity, project, task/job, approval, artifact and evidence state | Supabase / PostgreSQL | Source of truth; mutations remain server-authorized and policy-controlled. |
| Remote server-state cache and query lifecycle | TanStack Query, selectively | Client cache of server data only; never a second task/job database. Adopt only where it replaces ad hoc fetch/cache logic. |
| Shared ephemeral workspace UI state | Zustand, selectively | Current project-view selection, open panels, selected result, viewer tool state and other transient UI preferences. Do not persist accepted engineering facts here. |
| Isolated component state | React local state | Prefer local state unless multiple distant components genuinely share the state. |
| Chat thread and streaming lifecycle | assistant-ui + Vercel AI SDK | Preserve the existing chat owner; do not mirror streamed message state into Zustand/Redux without a proven requirement. |
| Complex form state | Existing React/form conventions with schema validation | Keep request validation contracts aligned with the host's canonical schema. |

**Redux Toolkit is not recommended as an additional store now.** Do not run Redux and Zustand as competing shared-state systems. Reconsider Redux only if measured workflow complexity requires centralized event middleware, strict reducer invariants or advanced debugging and a single-store migration is justified. Next.js App Router remains the routing authority; TanStack Router is not required. TanStack Table/Virtual can be evaluated for genuinely large engineering datasets, not introduced pre-emptively.

### Python service and distributed infrastructure decisions

- **FastAPI: selective adoption.** Use it for persistent Python services that need typed multi-endpoint APIs, OpenAPI contracts, health/readiness, job/status/cancellation endpoints or multiple service consumers. Do not rewrite small bounded workers that are adequately served by their existing process or standard-library HTTP contract. Python services must remain behind authenticated service boundaries and may report execution, not self-certify engineering correctness.
- **Cross-language contracts:** keep TypeScript and Python request/result schemas versioned and compatibility-tested. Pydantic may define Python request models where FastAPI is selected; it is not a reason to duplicate contract authorities.
- **Redis: defer pending measured need.** PostgreSQL/Supabase remains authoritative for tasks, jobs, approvals, artifacts and evidence. Redis may later accelerate short-lived cache, rate limiting, ephemeral coordination or high-volume telemetry. Critical events must be durably committed before publication; Redis Pub/Sub is not a durable event log or guaranteed-delivery queue.
- **Queue discipline:** do not add Redis, BullMQ, Kafka and RabbitMQ as overlapping infrastructure. First measure a bottleneck and select one smallest suitable addition. The current Postgres-backed durable execution foundation remains the default.
- **LangGraph:** keep it out of the engineering execution authority. Reconsider only for a demonstrable AI reasoning subgraph requiring richer model-state, interrupt/resume or model-routing semantics; it must still emit typed TaskSpecs into host policy.
- **Temporal:** defer until measured workflow duration, fan-out/fan-in, durable timers, compensation, multi-fleet scheduling or custom recovery complexity exceeds the maintainability of the existing Postgres orchestration.

## Model and reasoning boundaries

There are two related but distinct model paths:

1. **Streamed chat:** Vercel AI SDK with the official Google/Gemini provider; server-side API key, model name and timeout; bounded output and retry behavior. No browser-controlled model endpoint, system prompt or tools.
2. **Structured reasoning workbench:** a separate host-owned model adapter/HTTP transport for typed framework proposals. It has its own endpoint/configuration and schema validation. Its proposed output is advisory and cannot execute a capability, mutate task state, validate work or approve an operation.

Do not describe the structured reasoning endpoint as if it were the streamed chat provider. See [Model Provider Stack](reasoning-model-provider-stack.md).

Model output is untrusted. It cannot supply trusted project ownership, provider identity, evidence identifiers, validation receipts or approval state. The server and Engineering Core remain authoritative.

3. **Bounded model-directed action planning:** a separate core contract in `src/agents/action-planner.ts` can turn structured model output into a closed set of task actions: create task, update eligible task, request readiness, request approval, delegate or request execution. `runModelDirectedAutonomy` passes the plan to the existing bounded runner. The backend checks the host-owned graph revision, capability allowlist, registered capability definition and provider availability, risk ceilings, declared input paths, task mutability and task-readiness state before changing the graph or invoking a capability.

This action-planning path does not weaken the advisory reasoning schema. The model cannot assign task/project identity, status, approval grants, evidence IDs, validation/verification state or provider identity. Task IDs and timestamps are host-authored. Updates are limited to pre-ready tasks, cannot lower risk or remove dependency/requirement gates, and invalidate prior reasoning and approval. Pilot, experimental and high-risk capabilities acquire an approval gate. Execution remains behind the existing task-graph adapter and capability router.

**Rollout boundary:** the planner and bounded runner are core-level contracts; they are not yet exposed through an authenticated product route. Do not expose general autonomous execution until a durable run journal, per-action idempotency, leases and ambiguous-timeout recovery are implemented. The initial product route should use a narrow server-owned allowlist of verified capabilities.

## Engineering execution boundary

The Engineering Core requests typed capabilities such as shaft torque, the pilot solid-shaft static-yield calculation, bounded cylindrical CAD or static structural analysis, not arbitrary vendor commands. Model-directed plans enter through the bounded action planner and cannot call providers directly; each task execution is routed through the registered capability router after backend readiness and policy checks.

The pilot shaft calculation is implemented as a deterministic TypeScript capability and is persisted through the existing optimistic-revision project workspace. Its versioned state binds exact inputs and results with SHA-256 digests, a validation receipt and an artifact ID. Chat loads this state read-only after project authorization and checks the digest, deterministic recomputation and artifact link; chat does not run or mutate the calculation. The capability remains preliminary static yield only.

Provider adapters translate typed requests into provider calls. They do not decide engineering verification or bypass policy. Runtime availability comes from trusted deployment configuration and readiness checks, not user input or untrusted model output.

Generated CAD/solver programs and untrusted file conversions execute outside the Next.js process in isolated workers. Controls include allowlisted operations, bounded request sizes, timeouts, CPU/memory/process limits, least privilege, restricted filesystem access, network policy, explicit artifact directories and cleanup. A source policy or passing unit test alone does not prove that a deployed runtime enforces every control.

Mutating operations require idempotency and explicit retry rules. A timeout after a mutation may leave an ambiguous outcome; do not blindly replay it.

## Artifact, viewer and evidence boundary

Artifacts are typed, project-scoped objects—not loose model attachments. Where applicable, preserve artifact ID/type/format/schema, exact source revision, project/model/job lineage, provider/runtime, input assumptions, units and coordinate frame, storage reference, checksum, validation receipt, evidence links and known limitations.

The bounded CAD display-derivative/viewport path and drawing ingestion/preview are implemented. FEA mesh/result-field and P&ID/PFD viewers remain roadmap work. Babylon.js and Three.js remain renderer candidates; no production renderer has been selected. Keep the renderer adapter independent of canonical geometry, validation and evidence. Do not treat a rendered mesh as proof of geometry validity, solver correctness or approval.

Canonical engineering bytes, display derivatives, simulation inputs and simulation outputs are different artifact roles. A derivative must identify its canonical source, revision, digest and conversion lineage. A validation receipt applies only to the exact bytes, inputs, checks and runtime that it identifies; validating a BREP does not automatically validate a STEP/STL/3MF export. A rendered mesh or contour does not constitute a successful solve, geometry validation, mesh convergence or engineering approval.

Authorize every artifact and derivative operation server-side. Keep storage private and use appropriately short-lived signed access. Treat uploads and conversion inputs as untrusted. Mark dependent derivatives, meshes and results stale when their source artifact or revision changes. Viewer or conversion failure must not modify the validation state of the canonical artifact.

## Validation and engineering result states

Keep execution, validation, verification and approval separate:

- **PROPOSED / CALCULATED:** a candidate result exists.
- **EXECUTED:** a provider completed an operation.
- **VALIDATED:** the configured checks passed for the exact inputs and outputs.
- **VERIFIED:** the capability-specific evidence contract is satisfied.
- **WAITING_APPROVAL:** a required authorized human decision remains.
- **NEEDS_INPUT / BLOCKED / UNSUPPORTED / FAILED:** the operation cannot safely or successfully proceed.

Do not collapse these states into a generic success banner. Do not display absent values as zero, invent an evidence reference or claim a check ran when it did not. Validation proves only what its declared checks and evidence contract cover; it does not automatically prove physical-model adequacy or remove qualified engineering review.

## Security, authorization and persistence

1. Resolve authenticated identity and project membership on the server before project-scoped reads or mutations.
2. Use Supabase RLS and project permissions as data boundaries; never trust client-supplied owner, role or project associations.
3. Validate request and response schemas. Fail closed on unknown or contradictory evidence, provider identity, artifact bytes or lineage.
4. Persist accepted records only after required artifact storage and receipt checks succeed. Clean up orphaned objects when writes fail.
5. Use optimistic revisions for shared workspace/conversation state. Surface conflicts rather than silently overwriting another update.
6. Keep privileged service-role keys and external provider credentials in server-side secret stores.
7. Capture sufficient run/provider/validator metadata for diagnosis while redacting credentials and minimizing sensitive prompt/content retention.

## Current implementation versus target

**Implemented in the current source:** model-backed bounded action-planning core and backend task-mutation/readiness enforcement (not yet exposed through an authenticated product route); Forge workspace shell; Supabase authentication and project/workspace APIs; project-scoped conversational streaming; assistant-ui history integration; Streamdown/KaTeX/code rendering; separate deterministic engineering interaction; structured reasoning/intent paths; numerical and unit-aware calculations; bounded cylindrical CAD generation; isolated remote CAD worker; independent OCCT BREP validation; private project-scoped CAD artifact persistence; execution and evidence contracts; Gmsh/CalculiX reference FEA worker; Open3D one-shot perception prototype.

**Not yet delivered as complete user-facing capabilities:** shared artifact/viewer registry; interactive CAD viewer and supported general assembly inspection; production-selected 3D renderer; FEA mesh/result-field viewer; persistent P&ID/PFD editor/viewer; authenticated point-cloud upload/persistence; broad multi-provider CAD interoperability; authenticated model-directed capability execution route with durable agent-run journaling and idempotent recovery; chat-driven privileged tool execution; certified or standards-approved engineering outcomes. Babylon.js vs Three.js is awaiting the documented benchmark; OCCT is the selected initial geometry direction but general format coverage and runtime promotion remain gated.

See [Engineering Capabilities and Maturity](engineering-capabilities.md), [Artifacts and Evidence](artifacts-and-evidence.md), [Verified CAD Workspace](v2-1-6-cad-verified-workspace.md), [Worker Security](worker-security.md) and the [Implementation Plan](implementation-plan.md).
