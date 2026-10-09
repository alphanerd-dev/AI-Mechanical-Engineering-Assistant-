# Engineering Reasoning Frameworks and Skill Runtime

**Status:** Proposed architecture / implementation gate  
**Scope:** Cross-cutting capability for the commercial Engineering Workspace  
**Compatibility target:** Existing V2.0 workspace, agent runtime, task graph, capability router, validation, evidence, and project records  
**Roadmap relationship:** Cross-cutting foundation; does not replace or reorder V2.1 Multi-CAD.

## 1. Decision

Implement reusable engineering skills and reasoning frameworks as **versioned, validated capabilities coordinated by the existing Engineering Core**. Do not create a parallel agent runtime or let a framework result bypass task execution, engineering validation, evidence rules, permissions, or approval gates.

The first increment should establish contracts and routing, then demonstrate one skill and a small framework set. Keep this deliberately smaller than a general-purpose agent platform.

## 2. Why this fits the current repository

The current repository already provides the principal integration points:

- `src/agents/runtime.ts`: framework-neutral `AgentRuntime` and bounded action proposals.
- `src/task-graph/types.ts`: project-scoped tasks, dependencies, risk, approval, evidence, and task status.
- `src/core/types.ts`: risk, information status, project state, and capability contracts.
- `src/capabilities/catalog.ts` and the capability router: discoverable/routed capabilities.
- `src/completion/types.ts` and `src/intent/types.ts`: generic completion and natural-language entry contracts.
- Existing validation, evidence, project-state, and audit systems: authoritative result and traceability boundaries.

**Integration rule:** framework selection may inform a task plan, but only existing task-graph and capability execution paths can perform work. Existing shaft and electrical completion paths must remain behaviorally unchanged.

## 3. Component boundaries

1. **Skill manifest registry** — discovers, versions, and validates skill metadata.
2. **Reasoning framework registry** — discovers, versions, and validates framework metadata and input/output contracts.
3. **Framework router** — recommends applicable frameworks from task type, uncertainty, risk, evidence availability, and expected decision value.
4. **Skill orchestrator adapter** — maps skill steps to existing task-graph tasks and capability IDs; it does not execute tools directly.
5. **Framework runner boundary** — runs a bounded reasoning method and returns a typed proposal/result.
6. **Existing Engineering Core** — remains authoritative for capability authorization, deterministic execution, validation, evidence, and approval.

Do not add LangGraph, CrewAI, another agent framework, or a new workflow engine solely to support this layer. Keep any model/runtime adapter behind the current `AgentRuntime` contract.

## 4. Contract design

Use versioned TypeScript interfaces as the internal compile-time contract and JSON Schema for serialized manifest validation and interoperability. Schemas must explicitly declare JSON Schema Draft 2020-12. Prefer a maintained validator that supports the selected dialect; do not write a home-grown JSON Schema validator. Before adding a runtime dependency, verify license, maintenance, bundle/server impact, lockfile/package-manager conventions, and compatibility with the current build.

### Skill manifest (minimum fields)

- `id`: stable namespaced identifier, e.g. `engineering.hardware-innovation`
- `version`: semantic version
- `title`, `description`
- `domains`: applicable engineering domains
- `workflowStages`: stages this skill supports
- `inputsSchemaRef`, `outputsSchemaRef`
- `capabilityAllowlist`: existing capability IDs the skill may propose
- `frameworkPolicy`: allowed, preferred, or excluded framework IDs
- `riskPolicy`: maximum supported risk and approval requirements
- `definitionRef`: reference to the skill instructions/content, kept separate from manifest metadata
- `status`: experimental, pilot, verified, deprecated

A manifest is descriptive policy, not executable authority. Skills cannot widen the user's authorization, capability allowlist, risk ceiling, or approval policy.

### Reasoning framework manifest (minimum fields)

- `id`, `version`, `title`, `purpose`
- `applicableTaskTypes` and `domains`
- `requiredInputs` and `optionalInputs`
- `inputSchemaRef`, `outputSchemaRef`
- `prerequisites`, `contraindications`, `knownLimitations`
- `selectionHints` and `skipConditions`
- `expectedCost` (qualitative/estimated; not a measured runtime claim)
- `status`

Framework outputs must preserve the distinction between user-provided, known, assumed, estimated, calculated, measured, simulated, and verified information. A reasoning framework cannot label its own conclusions as verified evidence.

## 5. Framework routing policy

Routing should be selective, not a checklist that invokes every framework for every request.

1. Classify the task and identify the decision/problem type.
2. Collect relevant context and identify missing inputs, uncertainty, risk, and available evidence.
3. Filter frameworks by domain, task applicability, prerequisites, contraindications, and skill policy.
4. Rank eligible frameworks by expected usefulness relative to cognitive/tool cost.
5. Skip framework execution when the expected benefit is low or prerequisites are absent; ask the smallest material question when a missing input changes the decision.
6. Run within explicit input, step, time, and output bounds.
7. Validate the output contract and retain assumptions, alternatives, confidence, evidence references, and limitations.
8. Hand actionable proposals back to the existing task graph/capability router. Apply normal authorization, deterministic execution, validation, evidence, and approval gates.

The model may propose a framework. The deterministic router validates eligibility and policy. A framework result may guide exploration but cannot execute an engineering operation, approve a release, or satisfy a verification requirement by itself.

## 6. Initial framework library

Start with a small, testable set rather than implementing the entire framework catalogue at once.

| Framework | Initial use | Required safeguards |
|---|---|---|
| Weighted Decision Matrix | Compare explicit alternatives against weighted criteria | Scores and weights are judgments unless supported by evidence; expose sensitivity to weights; do not present the ranking as objective truth. |
| First-Principles Thinking | Decompose a problem into constraints, facts, assumptions, and derived implications | Preserve provenance for each premise; label estimates and assumptions; do not imply that decomposition proves correctness. |
| 5 Whys | Explore plausible causal chains for a problem or failure | Treat causes as hypotheses until evidence supports them; allow branching causes; do not force exactly five steps or declare root cause from questioning alone. |

Add Pareto analysis, fishbone, FMEA, fault-tree analysis, Bayesian reasoning, TRIZ, Design Thinking, systems thinking, pre-mortem, and other methods only when a clear use case and acceptance tests exist. Personal-development/coaching frameworks should be separate from the core engineering reasoning catalogue.

## 7. Evidence, safety, and provenance

- Framework outputs are reasoning records/proposals, not verified engineering evidence.
- Preserve framework ID/version, inputs, outputs, assumptions, selected alternatives, routing rationale, timestamps, and relevant source/evidence IDs in the existing project/task audit trail.
- Never invent citations, test results, simulation outcomes, measurements, standards requirements, or missing engineering parameters.
- Keep exploratory reasoning low-friction. Escalate to explicit questions, deterministic checks, specialist review, or approval as uncertainty and risk increase.
- For consequential tasks, only existing validation and approval mechanisms can authorize completion/release.
- Use the existing evidence model as the source of truth. Consider a W3C PROV mapping/export adapter later if external provenance interoperability is required; do not replace the current evidence model with a new provenance store.

## 8. Standards and dependency fit

| Candidate | Decision | Reason |
|---|---|---|
| JSON Schema Draft 2020-12 | Adopt for serialized contract validation | Mature, language-neutral interoperability standard. |
| Maintained JSON Schema validator | Select after dependency and lockfile audit | Avoid custom validation code; verify actual Draft 2020-12 support, license, and maintenance. |
| Existing `AgentRuntime` and task graph | Reuse | Keeps orchestration provider-neutral and preserves current controls. |
| Existing capability router, validation, evidence, and audit | Reuse | Avoids parallel execution and verification systems. |
| W3C PROV | Defer to an interoperability adapter | Useful for exporting provenance; not a reason to duplicate the current evidence model. |
| OpenTelemetry | Defer until traces/metrics show a concrete observability gap | Add standard telemetry where it improves diagnosis; avoid instrumentation for its own sake. |
| Temporal or another durable workflow engine | Defer | First demonstrate a need for durable long-running workflows that the current task graph and queue contracts cannot meet. |
| New general-purpose agent framework | Do not add in this increment | The current runtime contract already isolates orchestration. |

## 9. Implementation sequence

### Phase A — contracts and policy
- Add manifest types and versioned JSON Schemas.
- Add a schema-validation adapter using a maintained implementation after dependency review.
- Add registries with duplicate-ID, unsupported-version, missing-reference, and invalid-manifest rejection.
- Add framework eligibility/routing with explicit skip reasons.
- Do not yet connect framework results to engineering completion.

### Phase B — bounded demonstration
- Register one general R&D skill manifest.
- Register Weighted Decision Matrix, First-Principles Thinking, and 5 Whys.
- Add deterministic routing tests with representative problem types.
- Return structured reasoning records with assumptions, evidence references, limitations, and confidence calibration.
- Connect proposed next actions only through existing task graph and capability routing.

### Phase C — acceptance and measured expansion
- Add benchmark cases for usefulness, unnecessary framework invocation, missing prerequisites, and overconfident causal claims.
- Track selection precision, unnecessary invocations, time-to-trustworthy-result, and user correction rate.
- Expand the catalogue only when a framework improves task outcomes without increasing unnecessary friction.

## 10. Acceptance criteria

1. Valid manifests pass; malformed, duplicate, unsupported-version, and unresolved-reference manifests fail closed.
2. Framework selection is explainable and records why alternatives were selected or skipped.
3. Missing prerequisites produce a blocked/clarification result, not fabricated inputs.
4. Framework conclusions never create VERIFIED evidence or bypass engineering validation.
5. Skills can propose only allowlisted capabilities and cannot elevate risk permissions.
6. The implementation reuses the current task graph, AgentRuntime, capability router, evidence, and approval boundaries.
7. Existing shaft and electrical completion acceptance tests remain unchanged and pass.
8. Existing CAD capability/provider routing remains unchanged and passes.
9. Tests, type-check/build, and required CI checks pass on the exact tested commit before merge.

## 11. Explicit non-goals

- Replacing the Engineering Core with an agent framework.
- Running all reasoning frameworks for every task.
- Treating a framework's recommendation, score, or root-cause hypothesis as verified truth.
- Bundling all skill instructions into duplicated prompts or giant manifests.
- Introducing a second task graph, evidence store, approval system, or project-memory model.
- Delaying V2.1 Multi-CAD for a broad, speculative reasoning catalogue.

## Decision

Proceed with **Phase A first** as a small, reviewable implementation. Keep this architecture cross-cutting and customer-neutral. Continue V2.1 Multi-CAD as the main product roadmap; only expand reasoning-framework functionality when acceptance tests demonstrate a concrete improvement.
