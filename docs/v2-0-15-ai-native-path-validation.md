# V2.0.15 — AI-native completion path validation

## Purpose

V2.0.15 is the product acceptance gate for the first AI-native engineering workflow.

It proves that natural engineering intent can reach the existing shaft Engineering Completion Unit and produce a measurable, trustworthy result without inventing values, skipping deterministic validation, emitting VERIFIED evidence from failed/incomplete work, or silently forcing an unrelated task into the shaft workflow.

## Path under test

```
Natural engineering intent
  → ENGINEERING.ENTER_FROM_INTENT
  → context resolution
  → risk-adaptive experience
  → ENGINEERING.COMPLETE_SHAFT
  → deterministic execution
  → validation
  → automatic evidence
  → decision-ready result / escalation
```

The acceptance suite exercises the capability path directly; no UI is required.

## Product acceptance gate

The named suite contains seven cases:

1. **Intent routing** — supported shaft intent reaches `ENGINEERING.COMPLETE_SHAFT`.
2. **Context reuse** — known engineering inputs are reused without unnecessary questions.
3. **Minimal escalation** — only the first material missing input is requested.
4. **Fail-closed validation** — invalid deterministic input produces no VERIFIED evidence.
5. **Decision-ready result** — the result exposes the required decision fields rather than burying them in a raw completion payload.
6. **Multi-turn continuation** — a partial intent can pause, receive a follow-up, and resume without restating the complete original intent.
7. **No wrong-unit forcing** — unsupported intent is not silently mapped to the shaft completion unit.

## Decision-ready contract

Every accepted result path exposes a `decision` object containing:

- `status`
- `validationPassed`
- `evidenceIds`
- `nextAction` or `nextQuestion`

When deterministic validation has run, the decision carries available deterministic key numbers in the generic `metrics` array. The canonical shaft workflow currently emits:

- `torqueNm` with unit `N·m`
- `minimumDiameterMm` with unit `mm`
- `proposedDiameterMm` with unit `mm`

A needs-input result has `validationPassed: false` and an empty evidence list. A failed deterministic result likewise has no VERIFIED evidence.

## Multi-turn session boundary

V2.0.15 introduces a provider-neutral `EngineeringIntentSessionStore` contract with an in-memory reference implementation.

Session state is:

- project-scoped by `sessionId + projectId`
- limited to prior intent interpretation and extracted inputs
- defensive-copied on reads/writes
- used to reduce repeated input
- not an authorization source
- not an engineering-truth source
- not a replacement for durable Engineering Workspace / Project Memory

The deterministic core remains authoritative after continuation.

## Architectural invariants

1. **Interpreter proposes structure only.** It extracts intent, requirements, context and uncertainty; it does not calculate engineering results or declare validity.
2. **Deterministic core is authoritative.** Torque, sizing, validation and evidence remain provider-owned deterministic operations.
3. **No invention.** Unknown material inputs remain unknown and trigger the smallest required escalation.
4. **Evidence is a PASS-gated by-product.** Failed or incomplete validation cannot produce VERIFIED evidence.
5. **Approval does not override verification.** Authorization and approval boundaries remain explicit.
6. **Future model adapters emit structured EngineeringIntent.** A model may provide objective, domain, completion unit, requirements, constraints, proposed values, uncertainty/confidence and admitted missing inputs, but never engineering truth.
7. **No second engineering execution path.** AI-native entry must invoke the existing completion capability through the capability router; it must not call a separate shaft calculator or validation implementation.
8. **Unsupported intent is not forced.** A completion unit is selected only when the intent satisfies that unit's domain/objective contract.

## Benchmark cases

The reference suite uses:

- complete shaft design: 5 kW, 1500 rpm, 80 N·m bending, 55 MPa allowable shear, 30 mm proposed diameter
- missing material input
- context-only completion
- unspecified allowable stress
- invalid 10 mm proposed diameter
- two-turn continuation
- unsupported 10 bar pressure-vessel request

The reference interpreter remains deterministic and replaceable. It is a controlled test harness, not production AI intelligence.

## Non-goals

V2.0.15 does not add:

- an LLM or model-backed interpreter
- a conversational UI
- Multi-CAD
- new engineering domains
- broader shaft design such as fatigue, bearings, keys/couplings, critical speed or detailed CAD
- durable conversational/session persistence
- autonomous engineering judgment

## Exit criteria

V2.0.15 is complete only when:

- all seven acceptance cases pass in the named suite
- decision-ready fields are present on success, needs-input and failure paths
- multi-turn continuation works without full-intent restatement
- no-invention and fail-closed cases produce zero VERIFIED evidence
- unsupported intent is not silently mapped to the shaft unit
- architectural invariants are documented and regression-tested
- the full Engineering Core CI gate is green

The next milestone is V2.0.16: a model-backed intent adapter implementing the same provider-neutral intent contract.
