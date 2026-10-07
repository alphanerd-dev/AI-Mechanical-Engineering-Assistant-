# V2.0.10 — First Engineering Completion Unit

V2.0.10 turns the existing engineering primitives into one demonstrable end-to-end workflow: a bounded shaft-design completion unit.

## Workflow

`Explicit inputs → task graph → deterministic torque → deterministic shaft sizing → validation → evidence → approval → final verification → project completion`

The unit requires explicit:
- project ID
- transmitted power
- shaft speed
- bending moment
- allowable shear stress
- proposed shaft diameter

It does not invent missing design inputs. Missing or physically invalid inputs stop the workflow before deterministic execution.

## Deterministic execution

The completion provider delegates technical work through the existing capability router:
- `ANALYSIS.SHAFT_TORQUE`
- `ANALYSIS.SHAFT_SIZE`

The provider does not call a CAD/FEA/tool runtime directly.

## Validation

The completion unit performs explicit acceptance checks:
- torque output is cross-checked against the deterministic shaft-torque equation;
- calculated minimum diameter must not exceed the proposed diameter;
- incomplete provider outputs are rejected.

A failed validation gate produces no verified engineering evidence and prevents approval from closing the unit.

## Evidence and lineage

A calculation artifact is emitted as a by-product of successful validation. Evidence records explicitly link to:
- the requirements they support;
- the calculation artifact;
- the deterministic method and output.

The final completion report exposes requirement, artifact, and evidence IDs as a compact lineage record.

## Approval and authorization

The completion unit requires explicit final approval.

Approval is checked through the provider-neutral authorization policy:
- `REVIEWER` or `ADMIN` can grant approval;
- an `ENGINEER` cannot self-grant the final approval.

Approval does not override verification. After an authorized approval, the project is only closed when final project verification returns `PASS`.

## Scope boundary

This is a product/workflow proof, not a complete shaft design standard. It deliberately leaves fatigue, key/coupling geometry, bearing arrangement, critical speed, deflection, detailed CAD geometry, manufacturing release, and standards-backed material selection outside the unit.

The next V2.0 work should improve the engineering experience around this real workflow rather than add infrastructure for its own sake.
