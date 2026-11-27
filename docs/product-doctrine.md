# Product Doctrine — Engineering Outcomes, Not Engineering Overhead

**Decision date:** 27 November 2026  
**Status:** Adopted product and operating doctrine. Individual capabilities remain bounded by their documented contracts and acceptance evidence.

## 1. Product promise

> **Engineering outcomes, not engineering overhead.**

Reduce the total work and cost required to prepare, check and review a usable engineering outcome. Fit into existing engineering practice. Automate repetitive, bounded work where it is reliable. Keep assumptions, limitations and evidence visible. Involve the responsible engineer wherever judgment, approval or missing information genuinely matters.

Deliver a useful first result. Earn continued use through accepted outcomes—not through feature count, model activity or provider breadth.

The initial product direction is an **AI-assisted Mechanical Design Verification Workspace**. It complements established CAD/CAE/PLM systems; it does not replace them or act as an engineering certification authority.

## 2. Compact operating doctrine

> **AI coordinates. Engineering tools execute. Independent checks assess. Evidence records. Engineers approve.**

This wording defines responsibilities without implying that AI is only a text generator, that all engineering solvers are deterministic, or that validation proves complete physical truth.

## 3. Operating principles

1. **Interpret before acting.** Use AI to translate engineering intent into structured requirements, retrieve only authorized context, identify missing information and propose a bounded work plan. Never invent critical design inputs.
2. **Execute through authorised tools.** Calculations, geometry operations and simulations run through typed, versioned, permission-controlled capabilities and isolated workers. No arbitrary model-generated shell or Python execution in the product path.
3. **Check explicit claims independently.** Assess stated requirements, units, boundary conditions, formula/reference cases, geometry invariants, solver convergence and acceptance criteria. A passing check is evidence against the declared criteria—not proof of every possible failure mode.
4. **Record evidence with provenance.** Preserve inputs, units, assumptions, material data, method/standard selection, geometry and artifact revisions, tool versions, solver configuration, checks, limitations and reviewer actions.
5. **Keep engineering authority with engineers.** Qualified reviewers retain responsibility for design judgment, deviations, acceptance and release. The product does not certify safety or replace accountable engineering sign-off.
6. **Scale autonomy with risk.** Automate low-risk, reversible and well-bounded steps. Require confirmation for consequential actions, ambiguous requirements, external release or changes to controlled engineering data.
7. **Fail visibly and safely.** Incomplete data, unsupported geometry, failed checks, solver instability, stale sources and worker failures produce explicit exceptions and next steps—never a misleading success state.
8. **Hide unnecessary system complexity.** Expose the task, required inputs, progress, result and evidence. Users should not need to understand internal provider names, worker topology or subsystem boundaries.
9. **Fit existing engineering practice.** Support familiar file formats, units, design methods and review processes. Complement established CAD/CAE tools rather than demanding wholesale replacement.
10. **Optimise for accepted outcomes.** Measure total engineer effort, elapsed time and cost per accepted engineering outcome—not raw execution speed, AI usage or number of operations.

## 4. Experience rules

- **Task first:** organise the interface around the engineering job and the work package it produces.
- **Conversation as an input method:** use chat for natural-language intake, clarification and follow-up. Do not make chat the only way to start, inspect or complete work.
- **One coherent journey:** keep requirements, plan, execution, blockers, results, evidence and review decisions linked to one durable task.
- **Minimum necessary effort:** reuse trustworthy context; avoid repeated questions, duplicate entry, module hunting and avoidable handoffs.
- **Adaptive rigor:** keep safe, reversible, low-ambiguity work fast; increase questions, checks and approvals as risk, ambiguity, consequence or uncertainty rises.
- **Automatic evidence:** create and bind evidence as a by-product of supported validation; never fabricate evidence references or imply evidence exists when it does not.
- **Decision-ready results:** show status, values and units, assumptions, method, checks and scope, evidence, limitations, exceptions and next action.
- **Reliable recovery:** preserve valid work, expose ambiguous or failed operations and retry only where the capability defines safe idempotency.
- **Progressive disclosure:** ordinary users see engineering meaning and actionable readiness, not backend internals.
- **Economics by design:** control unnecessary model calls, retries, compute, integration burden, review effort and rework.

## 5. Result and decision states

A user-facing workflow must distinguish the states applicable to its capability contract:

| State | Meaning |
|---|---|
| PROPOSED | A candidate plan or operation is prepared; nothing has executed |
| NEEDS_INPUT | Required information is missing or ambiguous |
| AWAITING_APPROVAL | An authorized decision is required before execution or release |
| QUEUED / RUNNING | The task is persisted and executing or waiting for execution |
| EXECUTED | The declared operation completed; correctness is not implied |
| CHECKING | Independent checks are being evaluated |
| VALIDATED | The stated validation checks passed for the declared inputs and outputs |
| VERIFIED | The capability-specific evidence contract is satisfied; this is not universal physical proof |
| ACCEPTED / REJECTED | An authorized human reviewer recorded a decision for the exact task/artifact revision |
| BLOCKED / UNSUPPORTED / FAILED / CANCELLED | The workflow did not reach an accepted outcome; explain why and what can happen next |

Do not collapse these states into a generic green success banner. A worker exit code, model confidence, stored artifact or rendered image does not establish engineering validity. Missing evidence is not evidence of low risk.

## 6. Economics and success measurement

The primary measure is **total cost per accepted engineering outcome**:

`Cost per accepted outcome = engineering labour + AI/provider/tool execution + review and rework + allocated operations, integration and support costs`

Compare tasks with consistent scope, quality criteria and risk. Count time savings only when the result remains usable and meets the applicable acceptance criteria. The current real-world baseline is **NOT MEASURED**.

Track net engineer time saved, first-pass reviewer acceptance, rework, time to reviewable result, clarification cycles, repeat use, pilot-to-paid conversion and cost per accepted outcome.

## 7. Feature acceptance gate

A substantial feature is not product-ready merely because its code, API, provider or interface exists. It must show that:

1. It solves a real task within a clearly declared supported scope.
2. The target user can discover and complete the workflow without unnecessary setup.
3. It reduces net work or improves the accepted outcome without shifting hidden work to reviewers.
4. It reuses authorized context and exposes missing or uncertain inputs.
5. Execution, checks, evidence and approval are appropriate to the risk.
6. Unsupported and failed cases are explicit and recoverable.
7. Evidence is bound to exact inputs, revisions, outputs and tool versions.
8. Its benefit can be assessed against labour, compute, operations, support, review and rework costs.
9. Tests prove only the guarantees they actually exercise.
10. It preserves project isolation, authorization and existing deterministic engineering contracts.

A feature that only adds a model, provider, tool, dashboard, framework or configuration option has not met this gate.

## 8. Architecture implications

- Keep the provider-neutral Engineering Core, typed capability contracts, deterministic execution adapters, independent validators, evidence/provenance, server-side authorization and human approval boundaries authoritative.
- Models and agents may interpret, coordinate and explain; they do not own engineering truth, trusted provider identity, validation state, evidence IDs or approval.
- Reuse current task, provider, audit, artifact and evidence seams before adding queues, databases or orchestration frameworks.
- An adapter does not prove that a runtime is installed, licensed, reachable, benchmarked or production-ready.
- Keep capability domains modular and promote each only against a defined workflow and its own acceptance evidence.
- Keep geometry kernels and renderers replaceable behind adapters. Canonical engineering artifacts remain authoritative; display derivatives are traceable projections.
- Visualization is an inspection surface, not execution, validation, verification or approval.
- Maintain one coherent task journey while keeping deterministic execution, validation, evidence and approval as separate internal authorities.

## 9. Scope and decision rule

The first release focuses on one customer-validated mechanical design-verification workflow. Broader CAD/CAE, CFD, CAM, robotics, perception, industrial IoT and electromechanical capabilities are not launch commitments.

The proprietary Geometry Platform may continue as separate long-term R&D under its accepted architecture decisions. It is not a first-release dependency and must not delay a workflow that existing providers can support safely.

Choose the smallest complete change that measurably reduces effort per accepted engineering outcome while preserving engineering quality, evidence, security and human approval. When value is uncertain, measure before adding complexity.
