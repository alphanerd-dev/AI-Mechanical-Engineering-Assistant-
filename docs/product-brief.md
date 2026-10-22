# Product Brief — AI Mechanical Engineering Assistant

**Product direction:** AI-native Engineering Workspace evolving toward an Engineering Operating System  
**Initial domain:** Mechanical Engineering  
**Reviewed:** 22 October 2026

## 1. Vision and product promise

Turn engineering intent into usable, validated and traceable outcomes with less avoidable manual work, rework and cost.

An engineer should be able to explain a problem in natural language, discuss constraints with an AI assistant, run supported engineering operations, inspect their results directly in the workspace, and understand what was checked and what decision remains.

The product begins with Mechanical Engineering but uses provider-neutral interfaces so more engineering domains can be added without replacing the core.

**Core rule: AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**

A generated answer, a completed worker process, a stored file or a rendered visualization is not by itself proof of engineering correctness.

## 2. Target users and primary workflows

The initial users are engineering students, design and analysis engineers, simulation practitioners, and engineering reviewers who need to move from problem statement to a defensible result with less coordination overhead.

A user should be able to:

1. State an engineering task naturally and refine it through a multi-turn conversation.
2. Reuse authorized project context and provide material missing inputs when asked.
3. Request supported calculations, CAD operations, mesh generation and simulations through controlled engineering tools.
4. Inspect CAD models, FEA meshes/results, P&ID/PFD diagrams, plots, drawings and reports inside the workspace.
5. Ask follow-up questions about the result, request comparisons, and return to relevant artifacts and revisions.
6. Review assumptions, units, validation status, evidence, limitations, execution state and next action.
7. Recover from interrupted operations and persistence failures without losing work or accidentally duplicating non-idempotent actions.

## 3. Workspace experience

### Conversational AI

The primary user experience includes a first-class, ChatGPT-like conversational interface, not just engineering forms or a structured reasoning workbench.

Selected implementation direction:

- assistant-ui for the chat experience.
- Vercel AI SDK for model integration, response streaming and controlled tool interaction.
- A configurable OpenAI-compatible hosted endpoint for model access.
- Existing Next.js, React, TypeScript and Supabase for the application, authorization, project context and persistence.
- Existing Engineering Core, capability router, deterministic providers, isolated workers, validation and evidence contracts for engineering operations.

Provider credentials and endpoint configuration remain server-side. The chosen hosted model is not fixed yet: benchmark lower-cost candidates against representative engineering tasks, then select the least expensive model that meets minimum quality, tool-use, latency and reliability requirements.

The existing repository has a structured, non-streaming model transport. The new streaming chat experience must be added deliberately and tested separately. The UI library and SDK do not replace authorization, engineering policy or independent validation.

### Engineering results workspace

Conversation and results should be visible as parts of one workflow. Use a resizable results panel or tabbed artifact surface to inspect outputs alongside the conversation.

The workspace should select a viewer based on a typed artifact contract rather than guessing from model prose. For each artifact, expose its identity and revision, originating operation, units and metadata, validation/evidence status, limitations, and authorized access path.

## 4. Visualization capabilities

### CAD and 3D

Provide interactive orbit, pan, zoom, fit-to-view, camera presets, model selection and visibility controls. Add measurements, property inspection, revision comparison and assembly hierarchy only where trusted geometry data and the chosen format support them.

Three.js is the proposed browser rendering layer. glTF/GLB may be used as a lightweight display derivative, while the canonical CAD representation remains authoritative. A validated BREP does not automatically certify STEP, STL or 3MF exports; each format needs its own applicable checks before it can be labelled validated.

### FEA mesh and simulation results

Render supported mesh types and available fields such as stress, strain, displacement and temperature. Provide field legends and units, mesh edges, deformation scaling, probing, load/boundary-condition overlays and solver metadata where the result data supports them.

VTK.js is the proposed scientific-visualization layer. Confirm input-format support and the conversion pipeline with representative result fixtures before committing to a format contract.

A viewer does not run a solver. A successfully rendered contour does not prove convergence, mesh independence, valid assumptions or structural safety. Those remain separate engineering checks and review gates.

### P&ID and PFD

Provide a typed model for equipment, ports, pipe segments, valves, instruments, identifiers and directed connections. Render through SVG or canvas so symbols, connections, search, selection, layers and zoom remain readable and structured.

Diagram objects should link to project equipment, calculations and evidence where available. Standards-specific symbol and drafting rules require an explicit, testable contract. P&ID rendering and authoring are new product requirements, not existing repository capabilities.

### Other result types

Extend the same artifact/viewer registry to calculation tables, plots, parameter sweeps, sensitivity results, engineering drawings, PDFs, BOMs, reports, manufacturing plans, point clouds and additional simulation outputs when each provider, format reader and acceptance contract is ready.

Unsupported formats must yield a clear explanation, secure download or supported conversion path instead of a blank viewer.

## 5. Artifact, provenance and evidence contract

Every engineering artifact should identify, as applicable:

- Unique artifact ID, type, format, schema version and source revision.
- Project and source-object identity, originating job/operation and relevant provider/runtime version.
- Private storage reference and integrity checksum.
- Source inputs, assumptions, units, coordinate frame, settings and result-field metadata.
- Validation outcome, validator identity/version, evidence/receipt references, warnings and known limitations.
- Related artifacts, requirements, reviewer decisions and approval state.

Display derivatives must reference their canonical artifact and conversion provenance. The workspace must not silently display a stale simulation as current after its source CAD or inputs change.

Use the existing project-scoped authorization, Supabase storage and evidence mechanisms where appropriate. Authorize artifact access server-side, keep private objects private, expire signed access links and treat uploaded content and conversion inputs as untrusted.

## 6. Engineering capabilities and tools

The repository already has project/workspace foundations, a capability catalog and routing, deterministic calculations, CAD/build123d execution and OCCT validation contracts, structured artifacts/evidence, bounded task-execution foundations, and reference/pilot numerical and FEA providers.

Current code also declares capabilities for geometry comparison and DFM checks, OpenModelica simulations, multibody dynamics, research providers, manufacturing checks, robotics assets and PLM. Catalog presence is not proof of an installed runtime, a successful live run or production readiness. Maturity and acceptance requirements are defined in [Engineering capabilities and maturity](engineering-capabilities.md).

The near-term product should strengthen the currently supported paths instead of exposing the entire catalog as if every tool were available.

## 7. Model cost and provider configuration

The model-provider priority is lowest practical API cost subject to task quality and reliability. Vercel AI Gateway is not the selected initial provider.

- Benchmark candidate model prices and actual capability, including tool-call correctness, structured output, missing-input behavior, response latency and reliability.
- Bound prompt/history size, output tokens, retries and request duration.
- Keep deterministic calculations and geometry operations outside the model.
- Record model/provider identifiers, available token usage, latency and measured cost without storing secrets or indiscriminately retaining raw prompts.
- Apply project-level authorization, rate limits and usage budgets.
- Use fallback models only when their behavior and tool compatibility have been explicitly tested.
- Do not claim precise cost or savings when the endpoint does not provide reliable usage/pricing data.

Keep one well-defined server-side model configuration where possible. Migrate existing intent-interpreter and reasoning-transport settings through an explicit, tested adapter rather than creating conflicting configuration systems or silently changing the semantics of the existing transport.

## 8. Trust, security and approval

- The server resolves the authenticated identity, role and project membership before reading or modifying workspace data.
- Model-generated tool calls are proposals. Only explicitly allowlisted, schema-validated capabilities may execute.
- Generated CAD/solver code runs only in a bounded isolated worker, never directly in the browser or ordinary Next.js request process.
- Mutating operations use idempotency, controlled retry and explicit state transitions.
- Independent validators check the appropriate outputs, inputs, provenance and artifact bytes.
- Evidence identifies what was checked, by which version, against which source inputs and artifact.
- Consequential actions remain approval-gated where the capability contract requires it.
- Rendering, execution success or model confidence cannot upgrade an engineering result to VERIFIED.

The user-facing states must distinguish PROPOSED, CALCULATED, EXECUTED, VALIDATED, VERIFIED, WAITING_APPROVAL, NEEDS_INPUT, BLOCKED, UNSUPPORTED and FAILED as appropriate. Preserve user input and offer a safe recovery path.

## 9. Milestones

The canonical delivery order and exit gates live in [Implementation plan and milestones](implementation-plan.md). At a high level:

1. Stabilize result decisions, failure recovery, outcome measurement and current-revision CAD acceptance.
2. Add secure streamed chat, the configurable model endpoint and controlled engineering tools.
3. Build a shared artifact/viewer registry and an interactive CAD viewer linked to canonical validated artifacts.
4. Add FEA mesh and field visualization backed by explicit solver-result and validation contracts.
5. Add typed P&ID/PFD rendering and connections to project engineering records.
6. Expand artifact viewers and provider coverage only where measured user need and acceptance evidence justify it.

These are product requirements and planned work, not assertions that every capability has already been implemented.

## 10. Success measures and non-goals

Measure time to accepted result, engineering-active time including review/correction, cost per accepted outcome, tool-call correctness, validation/evidence completeness, safe recovery, artifact load/failure rate, repeated use and avoidable rework. Mark unmeasured values unknown and do not claim productivity or safety gains without evidence.

The product does not initially promise general-purpose autonomous engineering, arbitrary assembly CAD, certified FEA/CFD, complete P&ID standards compliance, fully deployed provider coverage, or automatic approval of safety-critical decisions.

**Product principle:** Remove engineering overhead without weakening engineering truth.
