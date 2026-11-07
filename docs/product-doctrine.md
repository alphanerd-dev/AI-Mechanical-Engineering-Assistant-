# Product Doctrine — Engineering Outcomes, Not Engineering Overhead

**Decision date:** 13 October 2026  
**Status:** Adopted product direction; individual capabilities remain bounded by their documented acceptance contracts.

## Product principle

> **Engineering outcomes, not engineering overhead.**

Turn engineering intent into a usable, evidence-backed result—with less manual work, less rework and lower total cost.

Fit into the engineer's workflow. Automate coordination, execution, checking and documentation where reliable. Bring the engineer in when judgment, approval or missing information genuinely matters.

Stay fast by default. Apply the rigor the risk demands. Make evidence, limitations and status clear.

**Deliver useful value on the first task. Earn continued use through results.**

This is a product direction and acceptance standard, not a claim that every engineering domain, provider or runtime is currently supported.

## What the engineer should experience

> “I stated the problem. I got a checked result and a clear decision.”

For a supported workflow, the system should resolve available project context, ask material unanswered questions, select an eligible capability, coordinate deterministic execution, run required checks, collect evidence and present the outcome and next decision.

The conversational assistant is the entry point for discussion and explanation. Formal task execution remains an explicit, separately authorized Engineering Core workflow. Chat text alone is never a validated artifact, approval or evidence record.

## Doctrine hierarchy

### 1. Product promise

Reduce the total work and cost required to produce a usable, defensible engineering outcome.

### 2. Experience rules

- **Intent first:** organize the experience around the engineer's job, not internal services or tool names.
- **Minimum necessary effort:** reuse trustworthy context and avoid repeated questions, unnecessary setup, duplicate entry and manual handoffs.
- **Adaptive rigor:** keep safe, reversible, low-ambiguity work fast; increase checks, explicit questions and approval boundaries when risk, ambiguity, consequence or uncertainty requires it.
- **Automatic evidence:** produce and attach evidence as a by-product of successful validation wherever the capability supports it.
- **Decision-ready results:** make status, values/units, checks, evidence, assumptions, limitations, blockers and next action visible.
- **Reliable recovery:** distinguish pending work, completion, validation failure, missing input, approval required, unsupported work and infrastructure failure.
- **Workflow fit:** use existing project context and practical import/export paths.
- **Economics by design:** control unnecessary model calls, retries, compute, integration burden, review effort and rework.

### 3. Core engineering invariants

> **AI proposes. Deterministic systems execute. Validation decides. Evidence proves.**

> **Fast by default. Rigorous when it matters. Explicit when risk increases.**

> **NEVER CLAIM SUCCESS WITHOUT EVIDENCE.**

A plausible answer, successful process exit, model confidence, provider availability or stored artifact is not proof of engineering validity. Validation establishes only what its checks and evidence contract cover. It does not prove that requirements match the physical world or remove the need for qualified human review.

## Required result contract

Every user-facing completion path should make these distinctions clear where applicable:

- **PROPOSED / CALCULATED:** candidate result exists; validation may not have run.
- **EXECUTED:** a provider operation completed; this alone does not establish correctness.
- **VALIDATED:** defined checks passed for relevant inputs and outputs.
- **VERIFIED:** the capability's specific evidence contract is satisfied.
- **WAITING_APPROVAL:** required authorized human decision remains.
- **NEEDS_INPUT / BLOCKED / UNSUPPORTED / FAILED:** the workflow cannot yet deliver an accepted outcome; explain why and what can happen next.

Do not collapse these states into a generic success banner. Do not label checks as passed when they did not run. Missing evidence must not be presented as zero risk.

## Product-led adoption

The intended adoption loop is:

1. **Try:** start a realistic bounded task with minimal setup.
2. **Experience value:** receive a usable result, appropriate checks, evidence, limitations and next action.
3. **Return:** use the product again because it removes measurable work or rework.
4. **Share:** share a reviewable result with permissions and project boundaries preserved.
5. **Expand:** let a team evaluate a broader workflow based on demonstrated outcomes, security and economics.

Product-led growth is an objective, not a guarantee of viral or sales-free enterprise adoption. Procurement, security review, deployment, integration and governance may still require human coordination.

## Economics and success measures

The primary economic measure is **total cost per accepted engineering outcome**:

`cost per accepted outcome = engineering labour + AI/provider/tool execution + review and rework + allocated operations, integration and support costs`

Compare tasks with consistent scope, quality criteria and risk. Count savings only when the outcome remains usable and satisfies the applicable validation contract.

Track time to first accepted result, net engineering time saved, cost per accepted outcome, validation completeness, recovery quality, repeat use and team expansion. Instrument only data that can be captured reliably and with appropriate privacy controls.

The current outcome baseline remains **NOT MEASURED**. Automated test duration and fixture values are not real engineering productivity observations.

## Feature acceptance gate

Before a substantial feature is product-ready, show that:

1. It solves a real engineering task within a declared scope.
2. A user can discover and attempt it without unnecessary setup.
3. It reduces net work or improves the accepted outcome.
4. It reuses trustworthy context but does not invent missing inputs.
5. It applies risk-appropriate execution, validation, evidence and approval.
6. Its UI/API distinguish pending, accepted, needs-input, failed, blocked and approval-required states as applicable.
7. It preserves valid work and provides safe recovery.
8. Its benefit can be assessed against labour, compute, operations, support, review and rework costs.
9. Its tests prove only the guarantees they actually exercise.
10. It does not duplicate the deterministic core or bypass authorization and project isolation.

A feature that merely adds an AI model, provider, tool, dashboard or configuration option has not met this gate by virtue of existing.

## Architecture implications

- Keep the provider-neutral Engineering Core, Capability Router, deterministic execution adapters, validation contracts, evidence/provenance model, server-side authorization and human approval boundaries authoritative.
- Treat models and agents as contributors to interpretation and explanation—not sources of engineering truth, trusted provider identity, validation status or evidence IDs.
- Prefer existing task, provider, audit, artifact and evidence seams before introducing new queues, databases or orchestration frameworks.
- Keep support boundaries visible. An adapter or interface does not imply an installed, licensed, configured, reachable or production-verified runtime.
- Build an integrated but modular engineering workspace: capability domains share project identity, typed task contracts, artifact lineage, authorization, validation, evidence and approval, but are promoted independently against real workflows.
- Keep geometry kernels and renderers replaceable behind adapters. Canonical engineering artifacts remain authoritative; tessellated/display derivatives are traceable projections and never become engineering truth merely because they render successfully.
- Treat visualization as an inspection and interaction surface, not as execution, validation, verification or approval. Keep CAD geometry processing, scientific result visualization and 2D drawing rendering as distinct capabilities where their data semantics differ.
- Separate conversational explanation from registered deterministic execution and formal validation.

## Decision rule

Choose the smallest complete change that demonstrably reduces engineering effort or accepted-outcome cost while preserving correctness, evidence, security and approval guarantees. If the benefit is unproven, measure it before adding complexity.
