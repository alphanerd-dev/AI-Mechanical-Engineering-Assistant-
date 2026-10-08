# V2.0.17 — Real engineering interaction surface

## Purpose

V2.0.17 turns the validated AI-native completion path into a usable project interaction surface.

~~~text
Engineer
  → project engineering interaction
  → /api/engineering/intent
  → ENGINEERING.ENTER_FROM_INTENT
  → context + risk policy
  → deterministic completion capability
  → validation + evidence
  → decision-ready response
~~~

## Product behavior

The engineer can state a task in natural language and continue from the same project interaction without restating the full original request.
The surface shows the engineering-core response, the current decision status, available deterministic key numbers from the generic metrics collection, and evidence count.
When a material input is missing, the surface exposes the next required question instead of inventing a value.
When approval is required, the surface presents the state as a decision boundary rather than pretending approval occurred.

## Session boundary

The API route now owns a process-local V2.0.15-compatible session store and passes it to the existing AI-native provider.
Session state remains scoped by sessionId + projectId and is not an authorization or engineering-truth source.
Durable conversational storage across instances remains future workspace persistence work.

## Authority boundary

The interaction surface does not calculate engineering results.
It calls the existing intent capability, which routes to the existing deterministic completion capability.
The UI cannot manufacture evidence, validation results or approvals.

## V2.0.17 scope

Included:
- real browser interaction surface inside a project
- natural-language request composer
- multi-turn continuation using the existing session contract
- decision-ready result card
- explicit validation/evidence state
- project-level entry link

Not included:
- a new engineering execution engine
- a new model provider
- durable chat history
- collaborative comments/presence
- detailed engineering visualization
- broad domain expansion

## Acceptance

The merge gate must verify the full repository CI plus production build.
Manual product verification should confirm that a first request can be sent, a needs-input response can be continued in the same session, and a deterministic validated result exposes its decision fields and evidence count.