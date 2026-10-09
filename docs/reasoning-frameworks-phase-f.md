# Phase F: Workspace Integration for Controlled Reasoning

## Goal

Expose the Phase D controlled execution service and Phase E model adapter in the existing Engineering Workspace. The workbench creates and routes tasks, exposes missing framework inputs, requests a model-generated advisory proposal, and displays the saved reasoning record on the corresponding task.

## User flow

1. Open a project's Reasoning Workbench.
2. Create a task by describing its goal, risk, uncertainty, explicit input values, and selected framework/version.
3. Review the framework routing decision and any missing required inputs.
4. Update inputs and re-route the task when necessary. Input changes clear older reasoning records so they cannot be reused against a changed context.
5. Request a reasoning proposal only after routing selects a pinned framework version and required inputs are present.
6. Review the assumptions, output, limitations, required gates, and evidence references attached to that task.

## Persistence and authorization

- Durable project workspaces load and save the existing `engineering_workspaces.snapshot` contract.
- Workspace writes use the database row revision for optimistic compare-and-swap. A concurrent update fails with a conflict response rather than overwriting newer state.
- Reads require `PROJECT.READ`; task/workspace mutations require `PROJECT.WRITE`, in addition to Supabase project scope and row-level security.
- Invalid stored snapshots, project identity mismatches, and revision mismatches fail closed.
- The static `demo` project uses a subject-scoped, process-local snapshot only to support demonstrations. It is explicitly non-durable and must not be treated as production engineering lineage.
- A newly registered durable project gets its initial workspace snapshot on the first successful task save.

## Model transport

The workbench uses the Phase E `ModelReasoningGenerator` interface through a server-side Chat Completions-compatible HTTP transport. The endpoint, model name, optional credential, and timeout are configured with server-only environment variables documented in `.env.example`. No model vendor SDK is added. With no endpoint/model configured, task creation, framework routing, and input resolution still work, while proposal generation fails closed with a configuration message.

Model output passes through the existing `executeTaskReasoning` validation and task-graph mutation boundary. Provider output cannot choose task/project/framework identity, mark a record verified, execute engineering capabilities, grant approval, or transition a task lifecycle state.

## Acceptance checks

- Project-scoped workbench reads and workspace writes are protected by existing authentication/authorization and Supabase RLS.
- Task creation pins a framework id and version and persists its routing decision.
- Missing inputs block proposal generation before a model call.
- Updating inputs re-routes the task and clears stale reasoning records.
- Valid proposals persist as advisory records with `validationStatus: NOT_PERFORMED`.
- Malformed output, a `VERIFIED` claim, transport errors, and concurrent workspace writes fail closed.
- A reasoning proposal never advances task status or establishes engineering correctness.
- Full repository CI and production build pass before merge.
