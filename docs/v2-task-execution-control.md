# V2.0.2 Task Graph Execution Control

V2.0.2 connects the explicit engineering task graph to the existing EngineeringWorkflowEngine.

## Execution boundary

Only a task whose state is READY can enter execution.

Execution flow:

READY -> RUNNING -> workflow engine -> COMPLETED / FAILED / BLOCKED

The adapter converts one task into a bounded one-step EngineeringWorkflowPlan and therefore reuses the existing dependency, requirement, approval, evidence, retry, and capability-routing logic.

## Fail-closed behavior

- Non-READY tasks are refused.
- Workflow failure maps to FAILED.
- Missing approval or unsatisfied requirements map to BLOCKED.
- Evidence-required tasks remain BLOCKED when the workflow result contains no evidence or artifact.
- An absent workflow result cannot leave a task RUNNING; it is moved to BLOCKED.
- Task execution never transitions directly to VERIFIED. Verification remains a separate engineering gate.

## Autonomy boundary

V2.0.2 is an execution-control primitive, not autonomous engineering. A later bounded-autonomy layer may propose and sequence tasks, but it must call the explicit execution capability and remain subject to the same gates.

Capability:

TASK_GRAPH.EXECUTE_READY