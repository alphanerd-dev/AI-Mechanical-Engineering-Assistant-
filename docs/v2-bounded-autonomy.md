# V2.0.5 — Bounded autonomous execution + agent runtime boundary

V2.0.5 introduces the first bounded autonomous execution primitive while keeping agent frameworks outside the Engineering Core.

## Runtime boundary

The intended control path is:

```
AI model / LangGraph / future agent runtime
                |
                v
       AgentRuntime contract
                |
                v
       structured action proposals
                |
                v
       AGENT.RUN_BOUNDED
                |
                v
       Engineering Core policy gates
                |
                +--> AGENT.DELEGATE_SPECIALIST
                |
                +--> TASK_GRAPH.EXECUTE_READY
                |
                v
       deterministic providers
                |
                v
       validation / evidence
```

The Engineering Core remains the source of truth for project state, task state, capability definitions, risk, approvals, execution, and engineering evidence.

## Bounded autonomy contract

The initial hard ceilings are:

- 25 agent actions per run
- 10 task executions per run
- 10 specialist delegations per run
- maximum autonomous risk of HIGH
- stale task-graph revisions are rejected when an action supplies an expected revision
- CRITICAL work is outside the V2.0.5 autonomous boundary

The caller may further reduce those limits and may restrict capabilities or specialist ids.

## Action types

The bounded executor accepts only four structured actions:

- `EXECUTE_TASK` — execute one current READY task through `TASK_GRAPH.EXECUTE_READY`
- `DELEGATE_SPECIALIST` — delegate one current READY task through `AGENT.DELEGATE_SPECIALIST`
- `REQUEST_APPROVAL` — pause before gated work and require a human decision outside this executor
- `STOP` — terminate the run explicitly

The executor does not invent a capability, call a provider directly, mark a task VERIFIED, or bypass the existing task graph state machine.

## State ownership

LangGraph checkpoint state is orchestration state: agent progress, resumability, and execution context.

Engineering Workspace / Project Memory are engineering state: requirements, task graph, artifacts, evidence, approvals, and durable engineering lineage.

Those stores are deliberately not merged into one framework-specific state model.

## LangGraph integration

`LangGraphAgentRuntimeAdapter` is a thin adapter around a `LangGraphBridge` contract. The repository does not take a hard dependency on LangGraph.

This lets a real LangGraph.js implementation sit at the application/runtime edge while the TypeScript Engineering Core remains provider-neutral. LangGraph supports persistent checkpointing and resumable human-in-the-loop interrupts, which makes it a suitable first runtime for the adapter boundary.

CrewAI can later implement the same `AgentRuntime` contract without changing the Engineering Core.

## Architectural invariant

**The AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**
