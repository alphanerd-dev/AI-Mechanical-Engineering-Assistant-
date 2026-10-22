# Architecture and Trust Boundaries

**Reviewed:** 22 October 2026  
**Status:** Current architecture contract. Production readiness must be demonstrated on the exact source, deployment and worker revisions.

See the [Product Brief](product-brief.md) for the agreed experience and the [Implementation Plan](implementation-plan.md) for current milestones and blockers.

## Product principle

**Engineering outcomes, not engineering overhead.** Reduce the total work and cost required to produce a usable, defensible engineering outcome. Fit into the engineer's workflow, automate coordination and checking where reliable, and bring a human in when material judgment, approval or missing information requires it.

Core invariants:

- **AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**
- **Fast by default. Rigorous when it matters. Explicit when risk increases.**
- **Never claim success without evidence.**

A plausible model response, completed process, successful schema parse, stored artifact or rendered visualization is not proof of engineering validity.

## System view

Engineering user
→ Next.js Engineering Workspace (conversation, project context, decisions, artifacts and viewers)
→ authenticated server API and request contracts
→ Engineering Core (intent, context, requirements, state and capability policy)
→ capability router
→ deterministic providers and bounded workers
→ independent validation and evidence/provenance
→ authorized approval or next action.

Supabase provides identity/session integration, project and workspace persistence, database authorization and private artifact storage where configured. External CAD, solver, research, robotics and PLM systems remain provider adapters with explicit runtime and acceptance requirements.

## Conversational AI boundary

The selected conversational stack is assistant-ui for the user-facing chat interface, Vercel AI SDK for streaming/model integration/tool calls, and a configurable OpenAI-compatible hosted endpoint. The hosted model has not yet been selected; evaluate current pricing and representative task quality before fixing a default. Vercel AI Gateway is not the selected initial provider.

The application must keep the provider endpoint and credential server-side. The client cannot choose an arbitrary URL or pass a provider secret. Model output and tool-call arguments are untrusted. Server-side code must authenticate the actor, check project membership and permissions, validate tool schemas and enforce capability/risk policy before any operation executes.

The model may interpret intent, discuss trade-offs, ask for missing inputs, explain results and request allowlisted tools. It is not the source of engineering truth. The existing structured reasoning and intent-interpreter transports must retain their contracts while the streaming endpoint is added and configuration is consolidated through tested adapters.

Do not expose arbitrary Python, shell, SQL, filesystem access, unrestricted network access or arbitrary provider endpoints as conversational tools. Do not introduce a graph/agent framework or another job queue unless a measured acceptance gap justifies it.

## Engineering execution boundary

The Engineering Core requests capabilities such as shaft torque, bounded CAD creation or static structural analysis, not raw vendor commands. The capability catalog states purpose, inputs, outputs, risk, candidate providers and maturity.

Provider adapters translate typed requests into external calls. Adapters do not decide engineering verification or bypass policy. Runtime availability must be sourced from trusted deployment configuration and readiness checks; it must not be accepted from user input or untrusted provider output.

Generated CAD/solver programs and untrusted file conversions execute outside the Next.js process in isolated workers. Runtime controls include allowlisted capabilities, bounded request sizes, timeouts, CPU/memory/process limits, least privilege, restricted filesystem, network policy, explicit artifact directories and cleanup. A code path or policy document alone does not prove that the deployed runtime enforces these controls.

Mutating operations need idempotency and explicit retry rules. A network timeout after a mutating request can be ambiguous; do not blindly replay it.

## Artifact, viewer and evidence boundary

Artifacts are typed, project-scoped objects—not loose model attachments. Where applicable, preserve artifact ID/type/format/schema, exact source revision, project/model/job lineage, provider/runtime, input assumptions, units and coordinate frame, storage reference, checksum, validation receipt, evidence links and known limitations.

The unified workspace is planned to select renderers by trusted artifact type:

- Three.js for interactive CAD/display geometry.
- VTK.js for supported FEA meshes and scientific fields after format and conversion validation.
- A typed diagram model with SVG/canvas rendering for P&ID/PFD.
- Specialized chart, table, PDF and drawing viewers for other supported artifacts.

These viewer choices are planned integrations, not claims that the libraries are installed or all files already render. Display derivatives must reference the canonical artifact and conversion process. A validated BREP does not automatically validate STEP/STL/3MF exports; each representation needs applicable independent checks. A rendered mesh does not constitute an FEA solve or validation.

Authorize every artifact operation server-side. Keep storage private and use appropriately short-lived signed access. Treat uploads and conversion inputs as untrusted. Make stale dependent results visibly stale when their source artifact/revision changes.

## Validation and engineering result states

Keep execution, validation, verification and approval separate:

- **PROPOSED / CALCULATED:** a candidate result exists.
- **EXECUTED:** a provider completed an operation.
- **VALIDATED:** the configured checks passed for the exact inputs and outputs.
- **VERIFIED:** the capability-specific evidence contract is satisfied.
- **WAITING_APPROVAL:** the required authorized human decision remains.
- **NEEDS_INPUT / BLOCKED / UNSUPPORTED / FAILED:** the operation cannot safely or successfully proceed.

Do not collapse these states into a generic success banner. Do not display absent values as zero, invent an evidence reference, or claim a check ran when it did not. Validation proves only what its stated checks and evidence contract cover; it does not automatically prove physical-model adequacy or remove the need for qualified review.

## Security, authorization and persistence

1. Resolve authenticated identity and project membership on the server before any project-scoped read or mutation.
2. Use Supabase RLS and project permissions as data boundaries; do not trust client-supplied owner, role or project associations.
3. Validate request and response schemas. Fail closed on unknown or contradictory evidence, provider identity, artifact bytes or lineage.
4. Persist accepted records only after required artifact storage and receipt checks succeed. Clean up orphaned objects when writes fail.
5. Use optimistic revisions for shared workspace/conversation state. Surface conflicts rather than silently overwriting another update.
6. Keep privileged service-role keys and external provider credentials in server-side secret stores.
7. Capture sufficient run/provider/validator metadata for diagnosis while redacting credentials and avoiding unnecessary retention of sensitive raw prompts/content.

## Current implementation versus target

**Implemented or documented in repository:** provider-neutral capability routing; numerical/unit-aware calculation paths; project/workspace persistence; a persisted engineering conversation; configurable structured reasoning/intent model transports; bounded cylindrical CAD intent completion; isolated CAD-worker and independent OCCT validation contracts; private project-scoped CAD artifact persistence; evidence/provenance contracts; durable-execution foundations; reference/pilot FEA providers.

**Planned after this review:** assistant-ui + Vercel AI SDK streamed chat; canonicalized configuration for compatible hosted model access; chat tool-call lifecycle and cost/usage evaluation; unified typed artifact/viewer registry; interactive CAD display; VTK.js-backed FEA mesh/result visualization; P&ID/PFD model and viewer.

**Not implied by either the catalog or target design:** every adapter is installed, licensed or reachable; every declared provider is live-verified; general CAD/assembly support; certified FEA/CFD; manufacturing readiness; standards compliance; or production readiness for every workflow.

See also [Engineering Capabilities and Maturity](engineering-capabilities.md), [Artifacts and Evidence](artifacts-and-evidence.md), [Verified CAD Workspace](v2-1-6-cad-verified-workspace.md), [Worker Security](worker-security.md) and the [Implementation Plan](implementation-plan.md).
