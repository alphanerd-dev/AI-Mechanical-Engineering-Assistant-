# V1.6 Simulation Engine

The simulation layer separates FEA model definition, solver execution, and engineering acceptance.

Flow:

CAD artifact + verified material/load/constraint evidence
-> FEA model
-> isolated PyMechanical worker
-> FEA result artifact
-> convergence/numerical validation
-> engineering acceptance gate
-> evidence + project traceability

## Input rule

The AI must not invent critical simulation inputs. A static structural model requires explicit geometry, material properties, loads, constraints, and mesh settings. Missing critical inputs block execution.

## Result rule

A solver result is not automatically an engineering approval. The result must pass validation checks including solver convergence, finite outputs, and the preliminary stress-vs-yield check.

This yield check is only a screening gate. Real design acceptance may require factor of safety, fatigue, buckling, contact, thermal effects, nonlinear behavior, mesh convergence, experimental correlation, and applicable standards.

## Worker boundary

The production architecture should execute PyMechanical outside the Next.js process in an isolated worker. The existing worker policy principles apply: no arbitrary model-generated code, resource limits, controlled filesystem/network, process termination, and audit logging.

## Evidence

A validated simulation should produce:
- FEA_MODEL artifact
- FEA_RESULT artifact
- SIMULATION evidence
- input provenance
- solver/version information
- validation result
