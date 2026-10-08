# AI-native entry to the Engineering Completion Unit

## Purpose

This slice makes the existing V2.0 shaft Engineering Completion Unit reachable through natural engineering intent.

The product path is:

Natural engineering intent -> intent interpretation -> context resolution -> risk-adaptive experience -> completion-unit selection -> deterministic execution -> validation -> automatic evidence -> concise result / approval escalation

The AI-facing boundary is ENGINEERING.ENTER_FROM_INTENT.

## Trust boundary

The intent interpreter may propose a structured interpretation, but it does not perform engineering calculations.

The deterministic core remains authoritative:

- context resolution decides which known inputs can be reused;
- risk-adaptive experience decides the required interaction rigor;
- the capability router selects deterministic providers;
- the shaft completion unit performs torque and sizing calculations;
- validation decides whether the result passes;
- evidence is emitted only after deterministic validation;
- approval remains explicitly authorized.

## Reference interpreter

DeterministicShaftIntentInterpreter is intentionally a replaceable reference implementation. It extracts supported shaft inputs from natural language so the full product path can be tested without coupling the Engineering Core to an LLM SDK.

A future model adapter can implement the same EngineeringIntentInterpreter contract.

## Example

Input:

> Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. I am proposing 30 mm diameter.

The system extracts the five completion-unit inputs, assesses the work as rigorous, executes the existing completion unit, validates the proposed diameter, emits evidence automatically, and returns WAITING_APPROVAL unless an authorized approval is supplied.

## Non-goals

This does not create a free-form autonomous engineer.

It does not invent missing engineering values, bypass validation, create CAD, add fatigue analysis, or expand the completion-unit scope.

## Exit tests

The path is considered healthy when:

1. natural intent reaches the existing completion unit;
2. known context prevents duplicate questions;
3. the first material missing input is surfaced;
4. failed deterministic validation produces no verified evidence;
5. successful validated work produces a concise decision-ready result and approval escalation.
