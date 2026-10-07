# V2.0.11 — Risk-Adaptive Engineering Experience

V2.0.11 makes the second product principle operational:

> Fast by default. Rigorous when it matters. Explicit when risk increases.

The system does not require the engineer to select a mode for every task. It infers the minimum interaction level from engineering intent, consequence, ambiguity, risk, and material missing inputs.

## Experience levels

### FAST
Used for safe, reversible exploration with low-to-medium risk and low ambiguity.

Policy:
- automatic execution is allowed;
- no engineering evidence ceremony is required by this decision layer;
- the system should keep exploration lightweight and clearly provisional.

### RIGOROUS
Used when work changes project state or carries meaningful engineering consequence without needing a human decision point first.

Policy:
- deterministic execution remains automatic where authorized;
- validation and evidence are required by default;
- the engineer should not have to manually turn on a verification workflow.

### EXPLICIT
Used when ambiguity, consequence, critical risk, verification intent, or missing material inputs make an automatic decision unsafe or materially under-specified.

Policy:
- ask only the smallest material question when a missing input is the blocker;
- otherwise surface the control point explicitly;
- external/release actions and critical-risk work require an explicit approval boundary.

## Override rule

A request to "just explore" can make a safe reversible operation faster, but it cannot bypass hard safety, authorization, or consequential-action controls.

The experience engine therefore changes interaction friction, not engineering truth or authorization boundaries.

## Evidence and trust

The experience decision does not create engineering evidence itself. It determines when existing deterministic validation/evidence machinery must become part of the workflow.

This keeps the boundary clean:
- experience policy decides how much process is necessary;
- deterministic providers execute engineering work;
- validation decides acceptance;
- evidence records why the result is trustworthy.

## API

The protected `POST /api/engineering/experience` endpoint exposes the same provider-neutral decision through the capability router for product surfaces.

The endpoint requires `TASK.PROPOSE` authorization and accepts the experience assessment context as JSON.

## Scope

This milestone establishes the risk-adaptive policy and its application boundary. Context retrieval, memory-aware questioning, and richer conversational behavior remain V2.0.12 work.
