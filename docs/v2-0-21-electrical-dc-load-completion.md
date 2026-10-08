# V2.0.21 — First non-mechanical completion unit: Electrical DC load

## Purpose

V2.0.21 proves that the reusable engineering workspace can complete a real workflow outside Mechanical Engineering without changing the AI-native entry path or deterministic authority boundary.

The first cross-domain unit is a deliberately bounded steady-state DC electrical load workflow.

~~~text
Natural engineering intent
  → domain-aware intent interpretation
  → registered completion unit
  → CapabilityRouter
  → deterministic electrical calculations
  → deterministic validation
  → evidence
  → explicit approval
  → final verification
  → decision-ready result
~~~

## Scope

Inputs:
- DC voltage
- DC current
- maximum allowable power

Deterministic calculations:
- electrical power: P = V I
- equivalent resistance: R = V / I

Validation:
- voltage, current and maximum power must be positive
- calculated power must be finite
- calculated resistance must be finite
- calculated power must not exceed the explicit maximum allowable power

## Evidence

A passing workflow automatically produces three calculation/acceptance evidence records:
1. deterministic DC power
2. deterministic equivalent resistance
3. compliance with the explicit maximum-power requirement

A failed validation emits no VERIFIED evidence.

## Approval

A passing workflow enters WAITING_APPROVAL.
Only an authorized reviewer/admin approval can close the completion unit, followed by the existing final verification capability.

## Intent behavior

The deterministic reference interpreter recognizes bounded electrical/DC load requests and routes them to:

ENGINEERING.COMPLETE_DC_LOAD

The existing Mechanical shaft interpreter remains available for shaft intent, so the platform now has domain-aware routing without duplicating the engineering execution architecture.

## Model-backed behavior

V2.0.16 model-backed intent can already supply structured electrical inputs through the generic EngineeringIntent contract.

The model still proposes structure only. It does not calculate power, resistance, validation or evidence.

## Non-goals

- transient electrical analysis
- thermal design
- wire sizing
- protection-device selection
- switching/power electronics
- EMC
- circuit simulation
- ECAD generation
- broad Electrical Engineering coverage

This milestone is a cross-domain architecture proof, not a complete Electrical Engineering product.

## Acceptance gate

The milestone is complete only when:
- deterministic electrical calculation tests pass
- full DC-load completion passes with evidence
- missing input causes minimal escalation
- validation failure produces zero VERIFIED evidence
- authorized approval plus final verification closes the unit
- natural-language electrical intent reaches the electrical completion unit
- project context is reused without invention
- model-backed structured electrical intent reaches the same deterministic path
- unsupported pressure-vessel intent is not forced into the electrical unit
- full Engineering Core CI is green