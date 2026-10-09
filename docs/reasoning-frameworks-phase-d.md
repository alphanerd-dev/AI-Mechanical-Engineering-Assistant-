# Phase D: Controlled Reasoning Execution

## Goal

Connect an application-provided reasoning model to the Phase C task-graph contracts through a bounded service. The model proposes structured advisory content; the service and existing deterministic core retain control over identity, framework version, schema validation, graph mutation, and readiness.

## Flow

1. A task must already have a selected framework ID and exact version.
2. The service resolves that exact registered manifest and assembles input values from task-graph state. The task goal is exposed as the `task` input.
3. Required input values are checked before the proposer is called. Missing, null, empty-string, empty-array, and empty-object values stop execution.
4. The proposer returns only advisory content: status, assumptions, output, limitations, evidence references, and proposed gates.
5. The service rejects malformed responses, unsupported identity/control fields, non-JSON values, and any attempt to use `VERIFIED`.
6. A reasoning record is created with task/project identity and framework ID/version supplied by trusted task state, validated against the registered schema, and appended through the existing task-graph boundary.
7. The record remains advisory. The service does not execute engineering capabilities, change task status, grant approval, or mark validation as performed.

## Preserved gates

Every record retains the mandatory `engineering-validation` gate. Tasks requiring approval retain `human-approval`; tasks requiring evidence retain `evidence-validation`. Provider-proposed gates are preserved and de-duplicated. Evidence references are references only and do not establish evidence validity.

## Integration contract

`TaskReasoningProposer` is a small provider-neutral interface. An AI SDK, hosted model, local model, or deterministic test double can implement it without introducing a second orchestrator. Provider calls and provider-specific prompt policy stay outside the deterministic task graph.

## Verification focus

Integration tests cover successful proposal creation, immutable graph updates, missing required values (with no provider call), missing pinned versions, malformed provider output, cross-task identity injection, verification claims, and the prohibition on automatic readiness/status transitions.
