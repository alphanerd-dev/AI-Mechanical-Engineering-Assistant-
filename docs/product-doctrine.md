# Product Doctrine — Engineering Outcomes, Not Engineering Overhead

**Decision date:** 13 October 2026  
**Status:** Adopted product direction; individual capabilities remain bounded by their documented acceptance contracts.

## Product principle

> **Engineering outcomes, not engineering overhead.**

Turn engineering intent into a usable, evidence-backed result—with less manual work, less rework, and lower total cost.

Fit into the engineer's workflow. Automate coordination, execution, checking, and documentation. Bring the engineer in when judgment, approval, or missing information genuinely matters.

Stay fast by default. Apply the rigor the risk demands. Make every result's evidence, limitations, and status clear.

**Deliver useful value on the first task. Earn continued use through results.**

This is a product direction and acceptance standard, not a claim that every engineering domain, provider, or runtime is currently supported.

## What the engineer should experience

> “I stated the problem. I got a checked result and a clear decision.”

For a supported workflow, the system should resolve available project context, ask only material unanswered questions, select an eligible capability, coordinate deterministic execution, run the required checks, collect evidence, and present the outcome and next decision.

The engineer should not have to manually orchestrate internal steps, request evidence as a separate operation, or reconstruct the result from disconnected tool outputs.

## Doctrine hierarchy

### 1. Product promise

Reduce the total work and cost required to produce a usable, defensible engineering outcome.

### 2. Experience rules

- **Intent first:** organize the experience around the engineer's job, not internal services or tool names.
- **Minimum necessary effort:** reuse trustworthy context and avoid repeated questions, unnecessary setup, duplicate entry, and manual handoffs.
- **Adaptive rigor:** keep safe, reversible, low-ambiguity work fast; increase checks, explicit questions, and approval boundaries when risk, ambiguity, consequence, or uncertainty requires it.
- **Automatic evidence:** produce and attach evidence as a by-product of successful validation wherever the capability supports it.
- **Decision-ready results:** make the status, relevant values and units, checks, evidence, assumptions, limitations, blockers, and next action visible.
- **Reliable recovery:** distinguish pending work, completion, validation failure, missing input, approval required, unsupported work, and infrastructure failure. Preserve valid user input and provide a safe continuation or retry path.
- **Workflow fit:** use existing project context and practical import/export paths. Do not force an organization to replace its entire toolchain before it can experience value.
- **Economics by design:** control unnecessary model calls, retries, compute, integration burden, review effort, and rework. Optimize the cost of an accepted outcome, not merely the cost of a single model response.

### 3. Core engineering invariants

> **AI proposes. Deterministic systems execute. Validation decides. Evidence proves.**

> **Fast by default. Rigorous when it matters. Explicit when risk increases.**

> **NEVER CLAIM SUCCESS WITHOUT EVIDENCE.**

These invariants constrain how the promise may be delivered. A plausible answer, successful process exit, model confidence, provider availability, or stored artifact is not by itself proof of engineering validity.

Validation establishes only what its checks and evidence contract actually cover. It does not independently prove that the requirements accurately represent the physical world, that every modelling assumption is sound, or that an engineer's approval can be automated away. Human judgment and explicit approval remain required where the task or policy requires them.

## Required result contract

Every user-facing completion path should make these distinctions clear where applicable:

- **PROPOSED / CALCULATED:** candidate result exists; required validation may not have run.
- **EXECUTED:** a provider operation completed; this alone does not establish correctness.
- **VALIDATED:** the defined checks passed for the relevant inputs and outputs.
- **VERIFIED:** the capability's specific evidence contract is satisfied. Use only when that contract permits it.
- **WAITING_APPROVAL:** required checks passed, but an authorized human decision remains.
- **NEEDS_INPUT / BLOCKED / UNSUPPORTED / FAILED:** the workflow cannot yet deliver an accepted outcome; explain why and what can happen next.

Do not collapse these states into a generic success banner. Do not label checks as passed when they did not run. Missing evidence must not be presented as zero risk.

## Product-led adoption

The product should demonstrate value before asking users to configure a complex workspace, connect every integration, or attend a sales conversation wherever a safe, useful first task can be supported.

The intended adoption loop is:

1. **Try:** start a realistic bounded task with minimal setup.
2. **Experience value:** receive a usable result, appropriate checks, evidence, limitations, and next action.
3. **Return:** use the product again because it removes measurable work or rework.
4. **Share:** share a reviewable result with permissions and project boundaries preserved.
5. **Expand:** let a team evaluate a broader workflow based on demonstrated outcomes, security, and economics.

Product-led growth is an objective, not a guarantee of viral or sales-free enterprise adoption. Procurement, security review, deployment, integration, and governance may still require human coordination. The product must not sacrifice safeguards to manufacture frictionless onboarding.

## Economics and success measures

Establish a baseline on comparable engineering tasks before setting targets. The primary economic measure is **total cost per accepted engineering outcome**:

`cost per accepted outcome = engineering labour + AI/provider/tool execution + review and rework + allocated operational, integration, and support costs`

Use consistent task scope, quality criteria, and risk when comparing the before/after result. Count savings only when the outcome remains usable and satisfies the applicable validation contract.

Track at least:

- **Time to first accepted result:** whether a new user reaches practical value quickly.
- **Net engineering time saved:** effort removed after corrections, verification, and review are counted.
- **Cost per accepted outcome:** customer effort plus relevant execution and operating costs.
- **Validation completeness:** applicable required checks run; failures and unresolved gaps surfaced honestly.
- **Recovery quality:** a user can continue after input, provider, authorization, persistence, or validation failure without unsafe duplicate actions or avoidable loss.
- **Repeat use and team expansion:** whether the workflow delivers enough continued value to warrant adoption.

Supporting diagnostics can include first-task completion, time spent configuring, repeated questions, wrong-path selections, model/tool calls, retries, execution latency, validation failures, and rework. Instrument only what can be captured reliably and with appropriate privacy controls; do not invent precision where provider cost or human effort is not measured.

## Feature acceptance gate

Before a substantial feature is considered product-ready, its owner must show:

1. It solves a real engineering task within a declared and truthful scope.
2. A user can discover and attempt the workflow without unnecessary setup.
3. It reduces net work or materially improves the quality or usability of the accepted outcome.
4. It reuses trustworthy context but does not invent missing engineering inputs.
5. It applies risk-appropriate execution, validation, evidence, and approval rules.
6. Its UI/API distinguish pending, accepted, needs-input, failed, blocked, and approval-required outcomes as applicable.
7. It preserves valid work and provides a safe retry or continuation path on failure.
8. Its incremental customer benefit can be assessed against engineering labour, compute, integration, operations, support, review, and rework costs.
9. Its acceptance tests prove only the guarantees they actually exercise; usability and economic claims require relevant user/task evidence.
10. It does not duplicate the deterministic core, create a parallel evidence or approval path, or bypass authorization and project isolation.

A feature that merely adds an AI model, provider, tool, dashboard, or configuration option has not met this gate by virtue of existing.

## Architecture implications

- Keep the existing provider-neutral Engineering Core, Capability Router, deterministic execution adapters, validation contracts, evidence/provenance model, server-side authorization, and human approval boundaries authoritative.
- Treat models and external agents as intent/interpreting/orchestration contributors—not sources of engineering truth, trusted provider identity, validation status, or evidence IDs.
- Prefer the existing task, provider, audit, artifact, and evidence seams for observability before introducing another queue, database, analytics platform, or orchestration framework.
- Record operational and cost signals only where a trusted source exists; keep product analytics separate from engineering-validity claims.
- Design the main experience around intent → context resolution → required questions → execution → validation/evidence → decision/continuation, not around the architecture's internal modules.
- Keep support boundaries visible. An adapter or interface does not imply an installed, licensed, configured, reachable, or production-verified runtime.

## Current product boundary

The repository contains a bounded AI-native engineering interaction and deterministic completion capabilities, including explicitly scoped shaft, electrical DC-load, and sensible-heating paths, plus a separately bounded cylindrical CAD workflow. Their precise limits and deployment requirements remain defined by their capability-specific docs and live acceptance evidence. This doctrine does not imply general-purpose engineering autonomy, universal CAD/CAE coverage, standards certification, or production readiness for every listed provider.

## Decision rule

When trade-offs arise, choose the smallest complete change that demonstrably reduces engineering effort or accepted-outcome cost while preserving appropriate correctness, evidence, security, and approval guarantees. If the benefit is unproven, measure it before adding complexity.
