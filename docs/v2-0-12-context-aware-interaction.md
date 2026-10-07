# V2.0.12 — Context-Aware Engineering Interaction

V2.0.12 removes a major adoption failure mode: asking engineers for information the system already has.

Before asking for a material input, dimension, requirement, or other decision-relevant value, the interaction layer can resolve known project context and remove already-satisfied questions.

## Rules

1. Context can reduce interaction friction.
2. Context never licenses invention.
3. Unknown values remain unknown.
4. The smallest unresolved material input is surfaced.
5. Existing authorization and validation boundaries remain unchanged.

The context contract is deliberately provider-neutral. It can later be backed by project memory, durable workspace state, artifacts, evidence, CAD metadata, or other engineering sources without changing the experience policy.

## Scope

This milestone establishes the context-resolution primitive and capability boundary. It does not yet automatically search every connected source or implement conversational memory retrieval; those remain integration work after the primitive is proven.
