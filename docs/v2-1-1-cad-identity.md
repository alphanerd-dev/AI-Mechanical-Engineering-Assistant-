# V2.1.1 — Provider-neutral CAD model identity

## Objective

Introduce a stable Engineering Core identity for a CAD model while allowing that model to be linked to one or more provider-native model references. This is the first bounded slice of the V2.1 multi-CAD engineering layer.

## Contract

- A canonical CAD model has a stable identity, a project id, a display name, timestamps, and zero or more provider-native references.
- A native reference is identified by the tuple provider id + document id + model id. A provider URL is descriptive metadata, not an identity key.
- One canonical model may map to several CAD systems; one provider-native model cannot be assigned to two canonical models in the same registry.
- Registration and lookups are project-scoped. Cross-project registration and resolution fail closed.
- The registry returns defensive copies so callers cannot mutate stored identity records through returned references.
- An identity may be created before a provider-native reference exists; this is reported as a warning, not fabricated evidence of connectivity.

## Deliberate limitations

The registry is an in-memory reference implementation. It does not synchronize geometry, compare model equivalence, fetch a CAD document, assert revision parity, or prove that two native models contain the same geometry. Provider operations, durable persistence, revision/artifact provenance, geometry validation, and routing remain separate milestones.

## Verification

The acceptance tests cover structural validation, empty-reference warning behavior, duplicate mapping rejection, cross-project isolation, collision-safe linking, idempotent linking, timestamp validation, and defensive-copy behavior.
