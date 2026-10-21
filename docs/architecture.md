# Architecture and Trust Boundaries

**Status:** Current architecture contract, reviewed 22 October 2026. This document distinguishes implemented behavior from target state; deployment readiness requires exact-revision live acceptance evidence.

## Active implementation sequence

The authoritative current milestones and exit gates are in [Implementation Plan](implementation-plan.md). This architecture document defines boundaries; it is not a release-status report.

## Product principle

> **Engineering outcomes, not engineering overhead.**

Turn engineering intent into a usable, evidence-backed result with less manual work, less rework, and lower total cost. Fit into the engineer's workflow. Automate coordination, execution, checking, and documentation where the current capability can do so reliably. Bring the engineer in when judgment, approval, or missing information genuinely matters.

The user-facing outcome is: **âI stated the problem. I got a checked result and a clear decision.â** This is a direction and acceptance standard, not a claim that every domain or provider is supported today.

See [Product Doctrine](product-doctrine.md) for the full product promise, product-led adoption loop, feature acceptance gate, economics, and validation requirements.

## Core engineering invariants

> **AI proposes. Deterministic systems execute. Validation decides. Evidence proves.**

> **Fast by default. Rigorous when it matters. Explicit when risk increases.**

> **NEVER CLAIM SUCCESS WITHOUT EVIDENCE.**

Provider availability, a successful process exit, an LLM response, or a stored artifact is not by itself engineering verification. Validation proves only what its checks and evidence contract cover; it does not replace sound requirements, adequate physical models, or human judgment where required.

## System view

```text
User
  |
  v
Next.js Engineering Workspace (session, project context, explicit UX states)
  |
  v
Server API / authorization / input contracts
  |
  v
Engineering Core
  |-- project state, requirements, memory
  |-- intent normalization and bounded workflow orchestration
  |-- capability catalog + capability router
  |
  v
Provider interfaces (deterministic execution adapters)
  |-- calculations / units
  |-- CAD generation and execution
  |-- geometry validation
  |-- simulation / FEA
  |-- research retrieval
  |-- manufacturing / PLM (when provisioned)
  |
  v
Validation gates -> artifact + provenance -> evidence records
  |
  v
Authorized approval when required -> project state transition
```

The user interface is not an authority for project ownership or engineering validity. The server resolves the authenticated identity and project membership before reading or mutating project-scoped records. Client-supplied labels, provider IDs, filesystem paths, and claims such as `valid: true` are not trusted evidence.

## Product-to-system contract

The product's primary path is organized around the engineer's work, not the internal module order:

`intent â trusted context â minimum material questions â bounded execution â validation and evidence â decision or safe continuation`

- Reuse project-scoped context only after authorization and provenance checks. Context can remove questions; it never licenses invented values.
- The UI must distinguish a pending request from an actual completion and must present structured `NEEDS_INPUT`, `WAITING_APPROVAL`, `FAILED`, and `UNSUPPORTED` outcomes as decisions or blockers when the server returns themânot disguise them as generic transport errors.
- Preserve user input after transport, authorization, provider, persistence, or validation failures. Retry only when safe; do not repeat non-idempotent side effects blindly.
- Decision-ready responses expose only claims supported by the result contract: values and units, validation status, linked evidence, assumptions/limitations, blockers, and next action where available.
- Measure cost per accepted outcome from trustworthy execution and product telemetry plus validated user/task baselines. Do not add an analytics store or cost-estimation precision merely for symmetry; first reuse existing run IDs, provider metadata, audit, and evidence seams.
- Low-risk UX shortcuts may reduce ceremony but cannot bypass resource authorization, deterministic validation, evidence gates, or required human approvals.

The exact completion boundary remains capability-specific. See the acceptance and exclusions in each capability's documentation before making a product-wide claim.

## Architectural modules and seams

| Module | Responsibility | Interface / seam | Key invariant |
|---|---|---|---|
| Engineering Workspace | Present intent, project state, artifacts, evidence and blockers | Next.js routes and typed UI models | UI state never substitutes for server authorization |
| Server API | Authenticate, authorize, validate request shape, orchestrate persistence | Route handlers and shared request contracts | Fail closed on missing session, role, membership or required configuration |
| Engineering Core | Normalize intent, resolve requirements, route capabilities, coordinate state | Capability and workflow contracts | Domain policy remains independent of vendor-specific SDKs |
| Capability Router | Select eligible provider from trusted policy and host availability | Capability + provider contracts | Mock/planned/unavailable providers are not silently promoted |
| Provider adapters | Translate a capability into a provider-specific operation | Narrow, typed adapter interface | Adapter does not make the final verification decision |
| Execution workers | Run CAD/solver code with bounded resources | JSON/job contract over isolated process/container | No arbitrary generated code in the Next.js/Node process |
| Validation | Independently check domain-specific acceptance criteria | Validator result/receipt contract | Missing, mismatched or contradictory evidence fails closed |
| Artifact and evidence layer | Persist artifact bytes, provenance, receipts and trace links | Artifact/evidence records and storage adapter | Evidence binds to the exact artifact and execution lineage |
| Approval and project-state transition | Record authorized human decision and reason | Approval contract | Approval cannot bypass failed validation |

Prefer deep modules: a small, explicit interface should hide the complexity of provider execution, normalization, validation and persistence. Add a new seam when a real variation exists or a second adapter makes the seam concrete; do not add pass-through abstractions merely for symmetry.

## Data and trust flow

1. **Resolve identity and scope.** Authenticate on the server; verify role and membership for the requested project. Apply ownership checks to every resource operation, not only page navigation.
2. **Normalize intent.** Parse only supported shapes and units into typed input. Ask for critical missing information; do not silently invent dimensions, material properties, constraints, or boundary conditions.
3. **Choose a bounded workflow.** Use deterministic code for known calculation/workflow steps. A model may propose or normalize intent, but must not authoritatively mark a result verified.
4. **Route to an eligible provider.** Availability comes from trusted host configuration/runtime checks. Provider selection and fallback are risk-sensitive and observable.
5. **Execute in a constrained environment.** Use allowlisted capabilities, resource/time limits, least privilege, and explicit artifact roots. Docker access remains server-only and security-sensitive.
6. **Validate independently.** Validate outputs against the requested specification, engineering invariants, provenance and exact output bytes where applicable.
7. **Persist atomically enough to fail closed.** Do not return an accepted/persisted result if a required artifact upload, receipt check, or metadata write fails. Clean up orphaned objects best-effort.
8. **Record evidence and approval.** Evidence must identify what was checked, by which validator/version, against which inputs and artifact digest. Consequential project completion remains approval-gated where the capability contract requires it.

## Engineering result states

Keep execution, validation and approval separate:

- **PROPOSED / CALCULATED:** a model or deterministic calculation produced a candidate result.
- **EXECUTED:** a provider completed its operation and returned outputs.
- **VALIDATED:** the configured deterministic checks passed for the exact outputs and inputs.
- **VERIFIED:** the domain-specific evidence contract is satisfied; use only when that contract explicitly permits it.
- **WAITING_APPROVAL:** checks passed but an authorized decision is still required.
- **BLOCKED / NEEDS_INPUT / UNSUPPORTED / FAILED:** the workflow cannot safely continue.

A process exit code of zero, a passing schema, a plausible visualization, or a model confidence score does not establish engineering correctness.

## Provider and AI policy

- Core code requests capabilities such as `CAD.CREATE_PART`, `ANALYSIS.SHAFT_TORQUE`, or `SIMULATION.STATIC_STRUCTURAL`, not vendor tool names.
- Provider IDs, runtime availability, validator identity and evidence lineage are host-authored or independently verifiedânot accepted from untrusted provider output.
- External agents and MCP servers may be adapters at the edge; they do not replace the deterministic core, project authorization, validation or evidence model.
- Choose the lowest complexity that meets the use case: deterministic workflow first; one model call or bounded tools when needed; durable orchestration only when pause/resume, recovery, adaptive planning or human checkpoints justify it.
- Treat retrieved documents, repositories, prompts and tool output as untrusted data. Apply schema validation, authorization at each resource/tool operation, redaction, rate limits, tracing and sandboxing.
- Do not add LangGraph, CrewAI, an agent SDK, a vector database or another major dependency without a demonstrated requirement and a measurable acceptance criterion.

## Current implementation versus target

**Implemented or documented in repository:** provider-neutral capability routing; numerical and unit-aware calculation paths; structured artifacts/evidence; CAD provider contracts; opt-in isolated build123d execution; bounded cylindrical CAD intent completion; independent OCCT geometry acceptance; project-scoped CAD persistence and authorization contracts; explicit approval in supported completion workflows.

**Not implied by the architecture:** every listed adapter is installed or reachable; every solver is independently benchmarked; all CAD shapes/assemblies are supported; every provider has a production runtime; manufacturing readiness or standards compliance; certified FEA/CFD; continuous production monitoring.

See [provider architecture](provider-architecture.md), [artifacts and evidence](artifacts-and-evidence.md), [verified CAD workspace](v2-1-6-cad-verified-workspace.md), [implementation plan](implementation-plan.md), and [ecosystem inventory index](engineering-ecosystem-inventory.md).
