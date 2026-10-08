# V2.0.16 — Model-backed intent adapter

## Purpose

V2.0.16 adds a provider-neutral seam for model-generated structured engineering intent.
The model interprets the request; it does not become an engineering authority.

~~~text
Natural language
  → model intent adapter
  → validated EngineeringIntent
  → existing EngineeringIntentInterpreter contract
  → ENGINEERING.ENTER_FROM_INTENT
  → existing capability router
  → deterministic engineering completion
  → validation
  → evidence
  → decision
~~~

## Provider-neutral contract

The adapter depends only on:

- 'ModelIntentGenerator' — a host-supplied model transport
- 'EngineeringIntent' — the structured intent contract
- 'EngineeringIntentInterpreter' — the existing AI-native entry seam

No model SDK is required inside the Engineering Core.
A future runtime can implement 'ModelIntentGenerator' for any model provider without changing deterministic engineering providers.

## Structured output

The model may provide goal, optional engineering domain, completion unit, explicit inputs, input provenance, missing inputs, requested capabilities, interpretation confidence, interpretation ambiguity, and non-authoritative assumptions.

The model must not provide torque, minimum diameter, validation status, evidence IDs, artifact IDs, engineering pass/fail results, approvals, or other deterministic engineering results.
Unknown inputs cannot contain values.

## Provenance boundary

A value is accepted only with a declared source:

- USER — sourceText must occur in the submitted intent. Numeric values must agree with the number in that source text.
- CONTEXT — sourceKey must exist in supplied project context and the value must exactly match the context value.
- UNKNOWN — the input must omit its value.

This prevents the model from silently inventing engineering inputs.

## Deterministic authority

The adapter never calculates torque, sizing, validation, evidence, or approval.
The existing AI-native provider continues to own context resolution, risk-adaptive experience, supported-unit gating, minimal escalation, routing to ENGINEERING.COMPLETE_SHAFT, deterministic validation, evidence handling, and decision-ready output.

There is no second shaft execution path.

## Runtime integration

V2.0.16 intentionally does not hard-code a model vendor or credentials into the repository.
The host/runtime can inject a ModelIntentGenerator. Until a concrete model transport is configured, the deterministic reference interpreter remains available as a test harness.

Model availability must never change the authority boundary of the Engineering Core.

## Acceptance gate

The V2.0.16 benchmark covers valid model-backed routing, malformed-output rejection, no-invention/provenance rejection, context provenance validation, and unsupported completion-unit protection.
The existing V2.0.15 seven-case acceptance suite remains the regression gate for the full AI-native workflow. Decision-ready deterministic outputs use the generic metrics contract introduced in V2.0.19.