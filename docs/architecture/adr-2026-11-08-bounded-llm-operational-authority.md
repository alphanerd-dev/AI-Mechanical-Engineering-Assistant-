# ADR — Bounded LLM Operational Authority

**Status:** Accepted  
**Date:** 8 November 2026  
**Decision scope:** Engineering Core task orchestration and capability invocation

## Context

The structured reasoning workbench currently accepts advisory reasoning proposals only. That is an appropriate boundary for framework reasoning, but it does not provide a complete model-directed workflow loop. The product needs the LLM to propose task creation and updates, request readiness, and request execution of registered engineering capabilities.

Granting the model unrestricted access to task storage, providers, approval state or execution internals would make probabilistic output an authority boundary. That is not acceptable for engineering workflows.

The repository already provides a typed task graph, capability registry/router, bounded autonomy runner, task-readiness gates, deterministic task execution and approval/evidence states. The decision is to extend these existing contracts, not add a parallel agent runtime or task system.

## Decision

Adopt **bounded LLM operational authority**:

> The LLM may receive explicitly scoped authority to create and update eligible engineering tasks, request readiness, coordinate registered capabilities and request their execution. Every proposal is untrusted input. The backend validates it against registered capability contracts, host-owned authorization and policy, task-graph invariants, risk limits and approval gates before any state mutation or execution. The LLM cannot grant approvals, set privileged task states, establish validation or verification, or report execution success on behalf of a provider.

The following controls are mandatory:

1. **Host-owned authority.** The server supplies the project identity, task graph snapshot, allowlisted capability definitions, execution limits, permissions, task ID factory and timestamps. The model cannot choose or elevate them.
2. **Strict action parsing.** Model output is parsed into a closed action union. Unknown fields and unsupported action kinds are rejected. Model output cannot supply task identity on creation, project identity, task status, blocked reason, approval grants, trusted evidence IDs, validation receipts, verification state, provider identity or runtime identity.
3. **Registered capability contracts.** Every task capability must exist in the registry, have an executable provider, be allowed by the non-empty host capability allowlist, satisfy the risk ceiling and use only input fields declared by its capability definition. All declared input paths must be present before readiness/execution. Provider-specific validators remain responsible for detailed type, engineering and domain validation because the current CapabilityDefinition.inputs contract declares paths rather than full JSON schemas.
4. **Safe task creation.** The backend assigns the task ID, project ID, timestamps and PROPOSED status. A plan cannot reference a task created earlier in that same plan; the next planning cycle must receive the refreshed graph and host-generated identity. Risk cannot be lower than the registered capability's risk. Pilot, experimental and high-risk capabilities automatically require explicit approval; evidence requirements cannot be weakened by the model.
5. **Safe task updates.** Agents may update only PROPOSED, BLOCKED or FAILED tasks. They cannot lower task risk, remove existing dependencies or requirement gates, or alter status, approval policy or evidence policy. A content update returns the task to PROPOSED, clears previous reasoning records and routing decisions, and revokes any prior approval grant.
6. **Readiness is a backend decision.** REQUEST_READY calls deterministic readiness evaluation and the task-graph transition state machine. Missing inputs, unsatisfied dependencies/requirements, reasoning gates and approval requirements block readiness. An approval request creates a gate; it never grants approval.
7. **Execution is a backend decision.** EXECUTE_TASK is accepted only for a READY task after the current registered capability, provider, input contract, project and risk policy are checked. Execution remains behind TASK_GRAPH.EXECUTE_READY and the existing deterministic workflow/capability router.
8. **Bounded execution.** Existing hard limits remain in force: 25 steps, 10 task executions, 10 delegations and a HIGH maximum risk ceiling. Model-directed operation additionally requires a host-owned capability allowlist.
9. **Evidence and result integrity.** The model cannot claim an operation ran, that validation passed, that evidence exists or that an approval was granted. Those states are populated only by their owning backend/provider/human workflows.

The existing advisory task-reasoning response schema remains advisory and unchanged in meaning. A separate action-planning contract is used for operational proposals. The conversational chat route remains read-only and is not silently given these permissions.

## Rollout boundary

The core model planner and bounded execution bridge are implemented as reusable Engineering Core contracts. They are not yet exposed through an authenticated product route.

Do not expose a general-purpose autonomous execution endpoint until there is durable agent-run persistence and idempotent recovery. A timeout after a task mutation or provider invocation must not cause a retry to create duplicate tasks or repeat a non-idempotent operation. The route must persist run identity, action identity, graph revisions, lease/claim state and provider outcomes, and must recover or reconcile ambiguous in-flight actions before retrying.

Initial product exposure should use a narrow, host-authored allowlist of capabilities with verified providers and bounded side effects. Expanding that allowlist is a capability-specific security and acceptance decision, not an LLM setting.

The existing `engineering_execution_jobs` store is not a substitute for an agent-run journal: its request/backend contract is designed for deterministic numerical or worker execution and does not persist model-plan revisions, task-graph snapshots, action-level decisions or orchestration checkpoints. Its V2.0.29/V2.0.30 migrations are present in the repository and validated in the dedicated E2E project, but the production migration ledger still ends at V2.0.28 and the production schema does not contain that table/lease function. The existing durable API is explicitly feature-flagged off until its migration reconciliation, dedicated worker deployment and authenticated E2E gates are complete. Do not route agent runs through this store or enable either durable API based only on the core planner tests.

## Options considered

### A. Keep all model output advisory

**Advantages:** Smallest trust surface; existing reasoning path remains simple.  
**Disadvantages:** The AI cannot coordinate a complete task lifecycle; users must manually translate plans into structured tasks and execute each capability.

### B. Give the model direct task-store/provider access

**Advantages:** Simple model-side tools and fewer backend adapters.  
**Disadvantages:** Allows model output to bypass task invariants, authorization, risk limits, provider contracts, approval gates, idempotency and audit evidence. Rejected.

### C. Permit typed action proposals; enforce them in the backend

**Advantages:** Supports useful autonomy while preserving one task graph, capability router and deterministic execution path. Policies remain testable and provider-neutral.  
**Disadvantages:** Requires strict parsers, backend policy checks, action lifecycle tracking and a durable run ledger before production exposure. **Selected.**

## Consequences

### Positive

- The LLM can coordinate task creation, task refinement, readiness requests and registered capability execution.
- The task graph and capability registry remain the single source of operational truth.
- The model cannot self-approve, bypass task state transitions or certify its own engineering results.
- Capability allowlists, risk limits and approval requirements are controlled by the host.
- Existing deterministic providers, validation and evidence contracts remain in place.

### Negative and constraints

- The model may produce a plan that is structurally valid but technically poor; engineering validation remains mandatory.
- Capability definitions currently expose input paths, not full typed JSON schemas. Detailed data-type and domain checks must stay in the provider/validator until a separate versioned schema contract is introduced.
- Model planning adds latency and may return unusable proposals; parsing and policy rejection must be observable and recoverable.
- A production endpoint remains blocked on durable run persistence and safe idempotent recovery.
- Task updates intentionally invalidate reasoning/approval and may require another review cycle.

## Verification requirements

- Strict parser rejects unknown properties, unsupported actions, untrusted identity fields and privileged state/approval fields.
- Host allowlist, registry, provider availability, input paths and risk ceiling are enforced before action.
- Task creation assigns host-owned identity and begins in PROPOSED.
- Updates cannot alter immutable/in-flight states, lower risk or remove dependency/requirement gates.
- Updates clear stale reasoning and approval grants.
- Readiness requests cannot bypass missing inputs, dependencies, requirements or human approval.
- Execution occurs only through the existing task-graph and capability router.
- Existing reasoning, task graph, bounded autonomy, deterministic calculation and CAD/CAE tests remain regression gates.
- The exact pull-request head must pass CI before merge. Production route exposure requires a separate idempotent run-persistence design and acceptance.

## Follow-up

1. Complete the core parser, planner, mutation and bounded-execution tests.
2. Run the full repository test suite, type-check, build and architecture checks on the exact branch head.
3. Keep PR #142 and existing advisory-reasoning behavior intact; reconcile its documentation through this ADR rather than weakening its safety contract.
4. Design durable agent-run storage, action leases, idempotency keys, retry/reconciliation and human approval UX before adding an authenticated model-directed execution route.
5. Expand capability allowlists only after each provider passes its own acceptance criteria.
