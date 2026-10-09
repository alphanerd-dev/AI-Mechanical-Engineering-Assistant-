# Phase E: Model-Backed Reasoning Proposer

## Goal

Connect the controlled reasoning execution service to a host-supplied model through a small provider-neutral adapter. The model can propose structured reasoning for a task and a pinned framework; the existing deterministic service remains the only record-validation and task-graph mutation boundary.

## Flow

1. The task graph must already contain a selected, exact-version reasoning framework.
2. `ModelBackedTaskReasoningProposer` receives isolated snapshots of the task, framework manifest, and inputs.
3. The adapter supplies explicit instructions that prohibit engineering execution, verification claims, invented evidence, and ungrounded facts.
4. The injected `ModelReasoningGenerator` performs the model transport. Vendor SDKs, credentials, retries, and transport policy remain host-owned.
5. The adapter returns raw model output to `executeTaskReasoning`; that existing service validates the response, creates the version-pinned advisory record, and appends it through the task-graph boundary.
6. Invalid output, including `VERIFIED`, is rejected before record persistence. A successful reasoning proposal does not advance task status or replace engineering validation.

## Integration contract

- `ModelReasoningGenerator` is the transport interface; no vendor SDK or new orchestrator is introduced.
- `ModelBackedTaskReasoningProposer` implements the existing `TaskReasoningProposer` contract.
- `StaticModelReasoningGenerator` is an offline fixture for tests and conformance checks, not a production intelligence claim.
- Framework identity and version come from trusted task state, not model output.
- Evidence references are references only; their presence does not establish evidence validity.

## Acceptance

- Model requests contain the task snapshot, pinned framework manifest, required inputs, and explicit safety/format instructions.
- Model output is passed through the existing controlled execution validator.
- Invalid or verification-claiming output is rejected.
- Provider code cannot mutate caller-owned task graph state through request snapshots.
- Full repository CI and production build must pass before merge.
