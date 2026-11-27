# Product Experience and Architecture Alignment

**Decision date:** 27 November 2026  
**Inputs:** Product UI/UX audit dated 20 November 2026; Architecture Strategy dated 21 November 2026; Product Review dated 27 November 2026.  
**Repository baseline reviewed:** `c1c9de6cd9a940b7d73d557d29a2ec71b158e0e4`  
**Status:** Task-oriented Mechanical Design Verification Workspace direction adopted; first workflow and customer fit remain hypotheses; implementation remains partial and subject to the gates below.

## Executive decision

Build a **task-oriented Mechanical Design Verification Workspace** without rewriting the existing deterministic engineering core. The first release should complete one customer-validated mechanical design-verification workflow and produce a review-ready package with explicit checks and traceable evidence.

The UX audit identified a gap between the product promise and the current experience: guidance-oriented chat and separate deterministic task surfaces leave users navigating modules and transferring context. The target is one coherent task journey from guided or conversational intake through clarification, bounded planning, authorized execution, independent checks and human review.

Conversation is a natural-language input and follow-up method, not the whole product. The durable task, work plan, input set, execution state, result and evidence package are first-class product objects. This changes the user experience, not the authority boundary.

> **AI coordinates. Engineering tools execute. Independent checks assess. Evidence records. Engineers approve.**

## Evidence and current-state qualification

The 20 November audit was a read-only point-in-time review of the repository's `main` branch and a bounded authenticated production UI sample. It did not send a user message, start an engineering job, create or mutate a project, upload a file or alter production data. It did not include user interviews, full authenticated accessibility coverage, load testing, a penetration test or a complete cross-browser certification.

The audit's indicative overall UX maturity estimate (54/100) is an expert prioritization heuristic, not a user-study result or certification. The audit found:

- A coherent dark engineering visual identity and strong project/artifact/evidence foundations worth preserving.
- Guidance-only chat separate from deterministic Engineering Core execution.
- Navigation and project-level destinations that expose too much of the internal capability structure.
- No chat attachment control and incomplete generic project file inventory/download paths.
- Runtime readiness is deployment- and project-specific; a sampled CAD readiness check could not establish general availability, and the sampled project did not have a connected FEA solver.
- One serious public login link distinguishability/contrast issue (reported at 1.14:1); authenticated routes were not fully scanned.
- Productivity, time-saved, cost-per-accepted-outcome, user preference and willingness-to-pay baselines remain **NOT MEASURED**.

These observations must not be generalized beyond the reviewed source revision, account, project and test surface.

## Current implementation versus target experience

| Area | Current repository/product state | Target |
|---|---|---|
| Entry point | Authenticated project workspace and guidance-oriented chat; project/task destinations remain separate | Start from a guided request or conversation; associate/create a project when the work requires it and keep the durable task visible outside the chat |
| Task execution | Registered deterministic workflows are submitted through Engineering Core; chat does not invoke privileged capabilities | Chat proposes and coordinates supported tasks through a typed TaskSpec and host policy; workers remain deterministic and isolated |
| Progress and recovery | Existing durable execution/job primitives are bounded and feature-gated; not all lifecycle states are connected to chat | One durable task/event lifecycle visible from chat, Tasks and contextual result surfaces; reload restores state |
| Files | CAD/drawing ingestion paths exist for declared formats, but generic chat attachments and file inventory/download are incomplete | Secure attachment, project library, preview, download and provenance contracts |
| CAD/CAE | Bounded CAD/OCCT and reference/pilot FEA/CFD workflows; deployment readiness varies | Complete one accepted CAD workflow and one bounded FEA workflow before broad capability expansion |
| Navigation | Several destinations mirror technical modules and internal subsystems | Chat, Projects, Tasks, Library and Account; project Context, Results, Activity/Decisions and settings are contextual |
| Administration | Provider/diagnostic implementation concepts exist in application surfaces | Protected administrator controls; ordinary users see capability readiness and actionable explanations, not raw provider/worker details |
| Visualization | Bounded CAD display and drawing preview; production CAD renderer remains unselected; FEA scientific viewer remains roadmap work | Contextual CAD/CAE/drawing viewers with exact source revision and validation/evidence state |
| Accessibility | One public login issue identified; authenticated app coverage incomplete | WCAG 2.2 AA-oriented automated and manual testing for public and authenticated critical journeys |

## Target user journeys

### 1. New engineering objective

1. User opens Chat and describes a problem without first selecting a module.
2. Assistant uses only authorized context and asks for missing critical inputs.
3. Assistant distinguishes known, user-supplied, measured, assumed and unknown values.
4. When execution is useful and supported, it proposes a typed TaskSpec with method, inputs, assumptions, dependencies, outputs, acceptance criteria, limits and risk.
5. Host-side validation checks project membership, schema, capability/provider readiness, budgets, risk and approval.
6. The persisted task appears in the originating conversation and global Tasks monitor.
7. Durable progress, blockers and approval requests are streamed/read from task events.
8. Independent validation produces a result card containing inputs, assumptions, units, revision, artifact links, checks and their scope, limitations, provenance, approval state and next action.

### 2. CAD and drawing work

The user describes a supported part/drawing task in chat and attaches permitted source material. The system validates the file and project access, checks readiness, routes a bounded deterministic request to an isolated geometry worker, registers canonical artifacts and display derivatives separately, validates exact artifact bytes, and returns a contextual viewer. A revision change marks dependent derivatives and results stale. No arbitrary generated code runs in the web request process.

### 3. FEA

The user requests a supported structural case. The system collects geometry, material, loading, supports, units and acceptance inputs; rejects missing critical data rather than inventing it; dispatches only a bounded benchmark/case contract; checks mesh and solver results independently against analytical/reference data; and presents fields only when the relevant viewer and result manifest are accepted. A process exit of zero is not an engineering PASS.

### 4. Approval or external consequence

The system presents the exact task, artifact/revision, requested decision, technical evidence, warnings and consequence. It verifies the reviewer role and separation-of-duties policy. An approval is an immutable human decision bound to the reviewed revision; it is not inferred from a model's response or a worker completion.

### 5. Failure and recovery

Show whether the task needs input, awaits approval, is queued/running, failed, was cancelled, is blocked or needs reconciliation. Retry only where the capability contract defines safe idempotency. Preserve successful prior artifacts and evidence; never replay an ambiguous non-idempotent action silently.

## Product information architecture

### Global navigation target

- **Chat / Request:** natural-language intake and clarification; not the only way to start or inspect a task.
- **Projects:** project list, creation, membership and project context.
- **Tasks:** cross-project queue/history/status monitor, with return links to originating conversations.
- **Library:** user-authorized files, templates, references and reusable engineering assets.
- **Account:** real persisted preferences and account/security settings.

Within a project, keep Conversation primary. Expose Context, Results, Activity/Decisions and Project settings as contextual views. Do not duplicate the same task lifecycle in separate product modules.

### Progressive disclosure

Ordinary users should not be exposed to reasoning workbenches, private model reasoning, completion-unit internals, raw capability registries, provider IDs, worker diagnostics, API route names, raw database enum values or opaque UUIDs. Expose engineering content that supports decisions: parameters, equations, units, material and loading inputs, solver/runtime identity where relevant, mesh quality, validation findings, artifact lineage, assumptions, warnings and reviewer decisions.

Provider readiness should be expressed in user language and derived from real readiness checks. An unavailable provider must not be represented by mock output or a simulated success state.

## TaskSpec, lifecycle and evidence contract

TaskSpec is the formal boundary between probabilistic interpretation and deterministic execution. It must be versioned and include:

- Task and project identity, request type, declared capability and contract version.
- Typed inputs and immutable source references/digests.
- Parameters, units, coordinate frames and provenance labels.
- Assumptions, unknowns, constraints and dependencies.
- Expected outputs and artifact types.
- Acceptance and independent validation criteria.
- Risk classification, execution/resource/time budgets and retry policy.
- Approval requirements and approval identity/state (host-authored, never model-authored).

The lifecycle must separate proposal, input collection, approval, queueing, execution, checking, validation, verification and acceptance. Suggested states include `NEEDS_INPUT`, `AWAITING_APPROVAL`, `QUEUED`, `RUNNING`, `CHECKING`, `SUCCEEDED_UNVERIFIED`, `VALIDATED`, `VERIFIED`, `ACCEPTED`, `FAILED`, `CANCELLED`, `BLOCKED`, `UNSUPPORTED` and `RECONCILIATION_REQUIRED`. Use the existing task/job/evidence models where possible rather than creating competing records.

A task success must not imply engineering correctness. Artifacts are bound to exact input manifest, revision, provider/worker/kernel/solver version, output digest, validator version/result and human decision where applicable. A validated BREP does not automatically validate STEP/STL/3MF derivatives; a rendered mesh does not establish geometry or solver correctness.

## Architecture and framework decisions

### Preserve the current system boundaries

- Next.js / React / TypeScript remains the modular-monolith control plane and authenticated API.
- Supabase / PostgreSQL remains the durable source of truth for identity, projects, tasks/jobs, decisions, artifacts and evidence.
- Vercel AI SDK and assistant-ui continue to own the current model integration and chat stream.
- Typed TaskSpec, existing capability catalogue/router, policy gates and task graph remain authoritative.
- CAD, numerical, FEA, CFD, perception and document operations run in bounded specialist workers.
- Validation is independent of worker execution; human approval remains explicit for gated actions.

### Client-state ownership

| Requirement | Position |
|---|---|
| Remote server-state fetching/cache | Adopt TanStack Query selectively where it replaces ad hoc fetching and provides clear invalidation/refetch behavior |
| Shared ephemeral workspace UI | Use Zustand selectively for project/view selection, open panels, selected artifacts and viewer interaction state |
| Local isolated component state | Keep React local state |
| Chat message and stream state | Preserve assistant-ui and Vercel AI SDK as the chat-state owner |
| Durable tasks, jobs, artifacts and approvals | Supabase/PostgreSQL; neither TanStack Query nor Zustand becomes the source of truth |
| Redux Toolkit | Defer; do not add alongside Zustand absent a measured need for a single centralized store |
| Routing | Next.js App Router remains authoritative; no TanStack Router addition |
| Large engineering tables | Evaluate TanStack Table/Virtual only when dataset scale or rendering performance warrants it |

### Python APIs and infrastructure

- **FastAPI:** selectively use for persistent Python services that need typed multi-endpoint APIs, OpenAPI, health/readiness, status/cancellation or multiple service consumers. Do not rewrite every worker; keep narrow batch/process adapters when sufficient. It must not own project authorization or engineering acceptance.
- **Redis:** defer until measured demand for cache, rate limits, ephemeral coordination or high-volume telemetry. It must not replace PostgreSQL for durable job/evidence state. Persist critical events before publishing transient notifications. Do not introduce Redis + BullMQ + Kafka + RabbitMQ as overlapping infrastructure.
- **LangGraph:** conditional option for a bounded AI reasoning subgraph only where the in-house planner demonstrably lacks state/interrupt/resume capability. It does not own engineering execution, policy, project authorization or validation.
- **Temporal:** conditional option only when durable timers, extended waits, compensation, fan-out/fan-in or multi-fleet recovery materially exceed the maintainability of the Postgres-backed orchestrator.

These are architecture recommendations, not evidence that the libraries are installed, direct dependencies or production services.

## Prioritized delivery backlog

The first priorities close the evidence and product-workflow gap identified in the 27 November review. Chat-to-task work is justified as part of a complete selected workflow, not as a standalone platform milestone.

| Priority | Work item | Acceptance gate |
|---|---|---|
| P0-01 | Customer/workflow discovery | Compare the shaft candidate with at least two observed workflows; baseline effort, checks, review and buyer urgency; select one with a pilot commitment |
| P0-02 | M2 acceptance closure | Protected authenticated artifact/drawing workflow, stale-source and access-denial checks, exact-head deployment and paired physical desktop/Android renderer evidence |
| P0-03 | Calculation and geometry verification protocol | Reference cases, dimensional checks, independent calculations, declared tolerances, negative cases and explicit unsupported checks |
| P0-04 | One canonical task/evidence lifecycle | Durable task and artifact identity, deterministic transitions, refresh restoration and host-owned approval/policy invariants |
| P0-05 | Complete the selected engineering task | Guided/conversational intake through authorized execution, independent checks, review package and human decision; no privileged model bypass |
| P1-01 | Navigation consolidation | Chat, Projects, Tasks, Library and Account; contextual project views |
| P1-02 | Unscoped conversation and project association | New user can begin chat and attach/create a project without losing context |
| P1-03 | Attachments and file ingestion | Authorization, type/size limits, scanning, digest, provenance and safe failure |
| P1-04 | File inventory, preview and download | Project isolation, private storage and exact artifact lineage |
| P1-05 | Complete one CAD journey | Build, BREP/format validation as applicable, artifact persistence, viewer, stale-state and recovery |
| P1-06 | Bounded FEA journey and viewer | Named benchmark/case, mesh and numerical checks, result manifest and authenticated display |
| P1-07 | Progress, cancellation and recovery | Durable event stream, reload recovery and capability-specific retry semantics |
| P1-08 | Contextual results and approvals | Result card/evidence and immutable human decision bound to exact task/revision |
| P1-09 | Admin/provider settings protection | Ordinary users cannot change provider/model/worker infrastructure controls |
| P1-10 | Accessibility and mobile | Login issue fixed; automated and manual checks across authenticated critical journeys |
| P2 | Preferences, terminology, stale-result UX, activity/revisions, templates and reports | Persist real settings only; clear user language; contextual evidence and handoff |
| P3 | Broader CAD/assembly, FEA/CFD, CAM, robotics, ECAD/SPICE, collaboration and AI surrogates | Demand, licensing, runtime, benchmark, safety, independent validation and evidence gates |

## Release and measurement rules

- A mocked chat stream proves rendering/transport only; it does not prove live provider behavior or tool execution.
- A successful worker process proves execution only; a capability validator must establish its declared checks.
- Provider readiness is project/deployment-specific and must be checked at runtime.
- No user study or matched-task productivity trial was performed as part of the audit. Time saved, ROI, cost per accepted outcome, repeat use and willingness to pay remain **NOT MEASURED**.
- Keep the product fast for safe, reversible, low-ambiguity work; increase questions, validation and human approval as consequence, ambiguity and uncertainty rise.
- Preserve the dark engineering visual identity; focus redesign effort on navigation hierarchy, workflow integration, result clarity, mobile/keyboard/screen-reader operation and truthful states rather than decorative restyling.

## Decision ownership and update policy

This document consolidates the 20 November UX audit and 21 November architecture strategy. The canonical current-state documents are the [Product Brief](product-brief.md), [Architecture](architecture.md), [Implementation Plan](implementation-plan.md) and [Engineering Capabilities](engineering-capabilities.md). Update those documents when a capability or milestone changes; do not silently change this target document to imply that an unverified roadmap item has shipped.
