# V2.0.20 — Domain-neutral completion routing

## Purpose

V2.0.20 removes the remaining Mechanical-specific coupling from AI-native completion routing.
The intent provider no longer knows which engineering unit is the only valid completion path. It resolves a registered completion unit by identifier and delegates execution through the unit's declared capability.

## Architecture

~~~text
Engineering intent
  → completion-unit registry
  → selected EngineeringCompletionUnit
  → declared capability
  → CapabilityRouter
  → deterministic provider
  → validation
  → evidence
  → decision metrics
~~~

## Contracts

`EngineeringCompletionUnit` declares:

- stable completion-unit id
- capability used for execution
- required input keys and user-facing labels
- execution through the existing CapabilityRouter

`EngineeringCompletionReport` is domain-neutral at the shared layer:

- generic completion status
- optional completion-unit identifier
- generic decision metrics
- project/task/artifact/evidence lineage
- generic validation summary
- approval and next-action boundaries

The canonical shaft workflow retains its domain-specific validation fields through `ShaftEngineeringCompletionReport` while publishing generic `decisionMetrics`.

## Authority boundary

The registry does not calculate engineering results.
The completion-unit adapter does not calculate engineering results.
The existing deterministic capability provider remains authoritative.
This preserves the rule: AI proposes. Deterministic systems execute. Validation decides. Evidence proves.

## Failure behavior

An unknown completion unit is not silently mapped to another unit.
If a registered completion-unit adapter fails before producing an accepted report, the AI-native entry returns a failed decision with no evidence and no invented result.

## Non-goals

- no second engineering domain completion unit yet
- no new solver
- no model-provider integration
- no change to shaft formulas
- no relaxation of approval or validation gates

## Next step

With V2.0.18 and V2.0.19 completed, this milestone makes the platform ready for the first genuine non-mechanical completion unit without another shared-contract rewrite.