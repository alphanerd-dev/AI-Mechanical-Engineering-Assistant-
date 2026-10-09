# Phase C: Task-Graph Integration for Reasoning Frameworks

## Scope

Phase C integrates skill manifests, framework selection, and reasoning records with the existing Engineering Task Graph. It does not add a new agent runtime or execute a framework. Selection remains deterministic metadata routing; a model or application service is responsible for producing the actual advisory record.

## Skill registration and binding

`InMemorySkillManifestRegistry` validates each manifest against JSON Schema Draft 2020-12, stores immutable copies by exact `id@version`, rejects duplicate registrations, and returns copies so callers cannot mutate registered authority. Registry instances should be scoped to an application or workspace; do not use a shared mutable global registry across tenants.

Binding a skill to a task stores the validated manifest snapshot in task state. It rejects capabilities outside the skill's allowlist and tasks above the skill's declared maximum risk. A skill that requires approval adds an approval gate, but binding never grants approval. Existing approval gates are not removed by reassignment.

## Framework routing and records

`routeTaskReasoning` passes task type, risk, uncertainty, available input names, requested framework, and optional exact framework version to the existing reasoning router. The decision is stored in the task graph with its framework ID/version, reasons, and missing inputs. Re-routing clears old reasoning records to prevent stale reasoning from being reused after context changes.

`appendTaskReasoningRecord` accepts a record only when its task and project references match the target task and its framework ID/version match the selected route. The record is stored inside that task's reasoning state. Workspace snapshot validation and serialization therefore retain the record as part of the engineering project state.

## Optional readiness gate

Reasoning is advisory and is not required for every task. When `task.reasoning.required` is explicitly true, readiness requires a selected, version-pinned framework and a matching `PROPOSED` reasoning record. A blocked or skipped route, or a missing/incomplete record, prevents the task from becoming READY. This gate only establishes that the requested reasoning step was recorded; it does not establish engineering correctness.

Deterministic capability execution, engineering validation, evidence checks, and any approval requirements continue through the existing task graph, workflow engine, and Engineering Core. Reasoning records always use `validationStatus: NOT_PERFORMED` and cannot claim to be verified.

## Validation focus

Tests cover manifest registration/versioning, capability and risk boundaries, approval gating, built-in and custom framework routing, missing prerequisites, record/task/framework consistency, required-reasoning readiness, task status non-mutation during routing, and workspace persistence round trips.
