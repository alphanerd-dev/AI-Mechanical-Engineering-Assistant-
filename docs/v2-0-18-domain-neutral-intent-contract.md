# V2.0.18 — Domain-neutral intent contract foundation

## Why this milestone exists

V2.0.16 introduced a provider-neutral model transport boundary, but the interpretation result still exposed shaft-specific extracted-input typing.
That coupling would force future engineering domains through a Mechanical Engineering contract even when the model transport itself was generic.

V2.0.18 corrects that architecture before the first domain expansion.

## Boundary

~~~text
Model / deterministic reference interpreter
  → EngineeringIntent
  → generic extracted inputs + provenance
  → domain / completion-unit selection
  → domain-specific completion provider
  → deterministic validation + evidence
~~~

`EngineeringIntentInterpretation.extractedInputs` is now a generic `Record<string, number|string>`.
`EngineeringIntentEntryRequest.approval` uses the generic `EngineeringApprovalRequest` rather than a shaft-specific approval type.

## Non-goals

- no second engineering domain completion unit yet
- no new model provider
- no new solver
- no change to the deterministic shaft calculations
- no change to V2.0.17 interaction behavior

## Acceptance

- non-mechanical structured intent can be interpreted without shaft-specific extraction
- existing shaft intent extraction remains compatible
- V2.0.15 and V2.0.16 regression suites remain green
- no engineering result is produced by the intent interpreter
- the next domain can introduce its own completion-unit contract without changing the model transport seam