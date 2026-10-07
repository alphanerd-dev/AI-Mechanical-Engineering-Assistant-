# V2.0.4 — Multi-agent specialist delegation

V2.0.4 adds the first bounded multi-agent coordination primitive.

## Contract

A caller must explicitly provide:

- one task graph
- one task id
- one specialist id
- one workflow stage

The delegation provider validates the task graph, requires the task to already be READY, resolves the task capability definition, checks specialist domain authorization, and enforces the specialist risk ceiling.

A successful result creates a delegation record only. It does not execute the task, change task state, bypass approvals, or select a task automatically.

The receiving specialist may later invoke the existing TASK_GRAPH.EXECUTE_READY capability. Execution remains under the V2.0.2 dependency-aware workflow engine.

## Specialist boundary

Specialists are deterministic profiles with explicit domain scope and a maximum risk ceiling. CRITICAL tasks are intentionally outside the initial delegation boundary because specialist ceilings stop at HIGH.

## Architectural invariant

**The AI proposes. Deterministic systems execute. Validation decides. Evidence proves.**

V2.0.4 adds delegation; it does not introduce autonomous task selection or autonomous execution.
