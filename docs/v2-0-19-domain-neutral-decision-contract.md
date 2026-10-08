# V2.0.19 — Domain-neutral engineering decision/result contract

## Purpose

V2.0.19 removes shaft-specific result fields from the reusable AI-native decision contract.
The decision contract now exposes generic deterministic metrics so each engineering domain can report its own validated quantities without changing the workspace or intent layer.

## Contract

`EngineeringIntentDecision` contains:

- `status`
- `validationPassed`
- `metrics[]`
- `evidenceIds`
- `nextAction` and/or `nextQuestion`

Each metric contains a stable `key`, a numeric or string `value`, and an optional `unit`.

## Shaft compatibility

The existing shaft completion workflow is unchanged.
It now emits `torqueNm`, `minimumDiameterMm`, and `proposedDiameterMm` as typed decision metrics instead of top-level decision fields.
No deterministic calculation moved into the intent layer.

## Product effect

The V2.0.17 interaction surface renders decision metrics generically.
A future Electrical, Thermal, Fluids, Materials, or other engineering completion unit can return domain-specific validated metrics without introducing a new UI result schema.

## Invariants

- model intent remains interpretation only
- deterministic providers remain engineering authority
- validation remains the gate for VERIFIED evidence
- approval remains separate from validation
- no second engineering execution path
- unsupported domains remain fail-closed

## Non-goals

- no second engineering completion unit
- no new engineering solver
- no model-provider integration
- no change to the existing shaft calculation formulas