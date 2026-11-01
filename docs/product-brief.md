# Product Brief — AI Mechanical Engineering Assistant

**Product direction:** AI-native Engineering Workspace evolving toward an Engineering Operating System  
**Initial domain:** Mechanical Engineering  
**Reviewed:** 1 November 2026

## 1. Vision and promise

Turn engineering intent into usable, traceable outcomes with less avoidable manual work and rework.

An engineer should be able to describe a problem, discuss it with a conversational assistant, provide missing inputs, run an explicitly supported engineering task, and understand what was calculated, executed, checked and left for human decision.

The product starts with Mechanical Engineering and uses provider-neutral engineering contracts so more domains can be added without replacing the core.

**Core rule:** AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.

A generated answer, completed worker process, stored file or rendered visualization is not by itself proof of engineering correctness.

## 2. Primary user experience

The Engineering Workspace contains two complementary but distinct surfaces:

1. **Conversational assistant:** an interactive project-scoped chat for explanation, problem framing, conceptual discussion, comparison, missing-input identification and ordinary analytic calculations. It streams responses and renders Markdown, code and engineering equations.
2. **Engineering Core interaction:** a separate task surface for supported deterministic workflows. It is the explicit route for registered calculations or other capabilities that require typed inputs, execution, validation, evidence and a decision state.

The chat does not currently call privileged engineering tools, run CAD/FEA, execute arbitrary Python/shell, mutate project state or formally validate an engineering result. The assistant must never claim those actions happened merely because it described them.

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

The repository currently includes the workspace/authentication/persistence foundation, project-scoped chat, structured intent/reasoning paths, deterministic calculation foundations, bounded cylindrical CAD generation and validation, reference/pilot FEA execution, a Python numerical worker and an Open3D one-shot prototype.

The following remain planned or bounded: a shared artifact/viewer registry, interactive browser CAD viewing, VTK.js FEA visualization, structured P&ID/PFD authoring/viewing, authenticated point-cloud upload/persistence, general assembly/feature CAD, broad CAD-to-FEA workflows and chat-driven engineering tool execution.

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

## 7. Visualization direction

- **CAD:** interactive 3D viewing is planned. Three.js is a candidate rendering layer; canonical CAD remains authoritative.
- **FEA:** field/mesh viewing is planned. VTK.js is a candidate; supported formats and conversion paths must be proven against fixtures.
- **P&ID/PFD:** a typed diagram schema with SVG/canvas rendering is planned.
- **Other artifacts:** tables, plots, drawings, PDFs, reports, BOMs and point clouds may join the registry after each format and access contract is defined.

A viewer does not run a solver. A rendered contour does not prove mesh convergence, physical-model adequacy or structural safety. A rendered CAD derivative does not validate the canonical model or export.

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

## 10. Acceptance rule

A feature is ready only when its declared user task, supported scope, usability, security, failure recovery, validation/evidence boundary and economics have been assessed. Tests must prove only the guarantees they actually exercise. See [Product Doctrine](product-doctrine.md), [Architecture](architecture.md) and [Implementation Plan](implementation-plan.md).
