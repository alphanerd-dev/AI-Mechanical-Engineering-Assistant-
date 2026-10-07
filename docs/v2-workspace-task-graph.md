# V2.0.1 Workspace + Task Graph Foundation

V2.0.1 establishes the application boundary for bounded engineering autonomy.

## Workspace

An engineering workspace is a provider-neutral snapshot containing:

- project state
- validated task graph
- optional product-model revision reference
- optional artifact-registry revision reference
- workspace revision and save timestamp

The reference implementation is InMemoryEngineeringWorkspaceStore. It is intentionally replaceable by a database-backed store later.

Workspace updates use optimistic revision protection. Reads and writes return deep copies so callers cannot mutate stored state by reference.

## Task graph

Tasks are explicit engineering work items with:

- project scope
- goal and capability
- dependencies
- requirement gates
- approval gates
- evidence requirement
- bounded retry count
- lifecycle status

The state machine is:

PROPOSED -> READY -> RUNNING -> COMPLETED -> VERIFIED

with controlled BLOCKED and FAILED rework paths.

A task is eligible for READY only when its dependencies are complete, required project requirements are satisfied, explicit approval is present when required, and a capability is declared.

## Autonomy boundary

V2.0.1 does not execute tasks autonomously.

It establishes the state and control contracts that a later bounded-autonomy layer can consume.

The intended progression is:

AI proposal -> task graph -> readiness evaluation -> bounded execution -> validation -> evidence -> verification

The Engineering Core remains responsible for policy and orchestration; deterministic providers remain responsible for technical execution.
