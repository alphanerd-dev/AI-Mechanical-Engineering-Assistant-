# Architecture and Trust Boundaries

**Reviewed:** 1 November 2026  
**Status:** Current repository architecture. Production readiness is a separate release and runtime decision.

See the [Product Brief](product-brief.md) for the current user experience, the [Engineering Capabilities](engineering-capabilities.md) for maturity boundaries and the [Implementation Plan](implementation-plan.md) for current milestones.

## Product invariants

- **AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**
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

## Model and reasoning boundaries

There are two related but distinct model paths:

1. **Streamed chat:** Vercel AI SDK with the official Google/Gemini provider; server-side API key, model name and timeout; bounded output and retry behavior. No browser-controlled model endpoint, system prompt or tools.
2. **Structured reasoning workbench:** a separate host-owned model adapter/HTTP transport for typed framework proposals. It has its own endpoint/configuration and schema validation. Its proposed output is advisory and cannot execute a capability, mutate task state, validate work or approve an operation.

Do not describe the structured reasoning endpoint as if it were the streamed chat provider. See [Model Provider Stack](reasoning-model-provider-stack.md).

Model output is untrusted. It cannot supply trusted project ownership, provider identity, evidence identifiers, validation receipts or approval state. The server and Engineering Core remain authoritative.

## Engineering execution boundary

The Engineering Core requests typed capabilities such as shaft torque, the pilot solid-shaft static-yield calculation, bounded cylindrical CAD or static structural analysis, not arbitrary vendor commands.

The pilot shaft calculation is implemented as a deterministic TypeScript capability and is persisted through the existing optimistic-revision project workspace. Its versioned state binds exact inputs and results with SHA-256 digests, a validation receipt and an artifact ID. Chat loads this state read-only after project authorization and checks the digest, deterministic recomputation and artifact link; chat does not run or mutate the calculation. The capability remains preliminary static yield only.

Provider adapters translate typed requests into provider calls. They do not decide engineering verification or bypass policy. Runtime availability comes from trusted deployment configuration and readiness checks, not user input or untrusted model output.

Generated CAD/solver programs and untrusted file conversions execute outside the Next.js process in isolated workers. Controls include allowlisted operations, bounded request sizes, timeouts, CPU/memory/process limits, least privilege, restricted filesystem access, network policy, explicit artifact directories and cleanup. A source policy or passing unit test alone does not prove that a deployed runtime enforces every control.

Mutating operations require idempotency and explicit retry rules. A timeout after a mutation may leave an ambiguous outcome; do not blindly replay it.

## Artifact, viewer and evidence boundary

Artifacts are typed, project-scoped objects—not loose model attachments. Where applicable, preserve artifact ID/type/format/schema, exact source revision, project/model/job lineage, provider/runtime, input assumptions, units and coordinate frame, storage reference, checksum, validation receipt, evidence links and known limitations.

The shared artifact/viewer registry and full interactive CAD/FEA/P&ID viewers remain roadmap work. A capability catalog entry or worker output does not imply that a format is already rendered in the browser. A validated BREP does not automatically validate STEP/STL/3MF derivatives; each representation needs applicable independent checks. A rendered mesh does not constitute a successful solve or validation.

Authorize every artifact operation server-side. Keep storage private and use appropriately short-lived signed access. Treat uploads and conversion inputs as untrusted. Mark dependent results stale when their source artifact or revision changes.

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

**Implemented in the current source:** Forge workspace shell; Supabase authentication and project/workspace APIs; project-scoped conversational streaming; assistant-ui history integration; Streamdown/KaTeX/code rendering; separate deterministic engineering interaction; structured reasoning/intent paths; numerical and unit-aware calculations; bounded cylindrical CAD generation; isolated remote CAD worker; independent OCCT BREP validation; private project-scoped CAD artifact persistence; execution and evidence contracts; Gmsh/CalculiX reference FEA worker; Open3D one-shot perception prototype.

**Not yet delivered as complete user-facing capabilities:** general-purpose CAD/assembly authoring; full browser CAD viewer; shared artifact/viewer registry; VTK.js FEA result visualization; persistent P&ID/PFD editor/viewer; public authenticated point-cloud upload/persistence; chat-driven privileged tool execution; certified or standards-approved engineering outcomes.

See [Engineering Capabilities and Maturity](engineering-capabilities.md), [Artifacts and Evidence](artifacts-and-evidence.md), [Verified CAD Workspace](v2-1-6-cad-verified-workspace.md), [Worker Security](worker-security.md) and the [Implementation Plan](implementation-plan.md).
