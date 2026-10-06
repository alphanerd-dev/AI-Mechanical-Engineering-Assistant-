# V1.20 Constraint Solving + Tolerance

V1.20 adds a provider-neutral deterministic layer connecting requirements and constraints to bounded solving and tolerance workflows.

## Constraint solving

The deterministic solver accepts explicit variable units and finite bounds. The current foundation supports linear equality systems with optional bound and inequality checks. It uses Gaussian elimination for fully determined equality systems and fails closed when a problem requires a solver capability outside this bounded foundation.

Statuses:
- SOLVED: explicit solution satisfies all supplied bounds and inequalities.
- INFEASIBLE: explicit system is inconsistent or the solution violates an explicit constraint.
- INCOMPLETE: critical information or supported structure is missing.

A solved constraint set is not an engineering safety verdict.

## Design-space exploration

The explorer performs deterministic bounded grid enumeration. Every variable requires a unit, lower bound, upper bound, and positive step. An optional linear objective selects a minimum or maximum feasible point.

The sample limit is explicit. Reaching that limit produces INCOMPLETE; it is never presented as an exhaustive optimum.

## Tolerance stacks

Worst-case stacking converts compatible units into a requested base unit and propagates explicit asymmetric plus/minus limits. Coefficients and signs make assembly-direction effects explicit.

RSS is available only when each contributor supplies an explicit one-sigma value. The system does not infer statistical distributions from tolerance limits.

## Fit and callout handling

Generic symmetric, bilateral, and unilateral callouts can be parsed into nominal and deviation fields. ISO 286 fit designations can be recorded with explicitly supplied deviations. The foundation deliberately does not invent fit-table values; a standards-backed lookup provider is required before a designation can be resolved from authoritative tables.

## Provider boundary

constraints.deterministic owns the deterministic execution boundary for constraint solving, design-space exploration, worst-case tolerance, RSS tolerance, generic callout parsing, and ISO 286 callout recording.

The AI layer proposes variables, constraints, objectives, and design intent. Deterministic computation produces results; validation and evidence remain responsible for engineering acceptance.
