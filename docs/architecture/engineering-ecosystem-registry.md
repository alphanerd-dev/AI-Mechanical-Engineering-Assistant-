# Engineering Ecosystem Registry

**Status:** initial canonical triage; not an approval to install or execute a candidate.  
**Last reviewed:** 2026-10-13  
**Source of candidate names:** prior research inventory supplied in the architecture-review discussion.  
**Evidence standard:** a candidate remains `unverified` until its canonical repository, reviewed commit/release, license file and license obligations, maintenance status, security posture, and reproducible acceptance evidence are recorded.

## Decision rules

- A repository may be a provider, runtime, library, benchmark, research reference, data source, or design-pattern reference. These roles are not interchangeable.
- Research/reference does not imply runtime dependency. Prefer adapters around stable interfaces and keep external execution isolated.
- Do not copy or redistribute code until license and transitive dependency obligations have been reviewed for the intended commercial distribution.
- Do not accept an LLM judge, successful process exit, geometry metrics, or solver completion as independent proof of engineering validity.
- Promote candidates through `research → screened → pilot → supported`. Any failed gate returns the candidate to `blocked` or `research`.
- Do not install several overlapping adapters for one provider without a measured capability gap.

## Registry fields

| Field | Meaning |
|---|---|
| Candidate | Project or repository name |
| Canonical URL | Supplied upstream URL; must be re-resolved before promotion |
| Role | Intended architectural role |
| Priority | Relative order for evaluation, not production approval |
| Status | Current evidence status |
| License / revision | Must be verified against exact reviewed commit/release |
| Acceptance evidence | Tests, benchmark, security and operational evidence required |
| Decision | Integrate, pilot, reference-only, defer or reject; blank until evidence is reviewed |

## Priority 0 — controlled pilots

| Candidate | Canonical URL | Role | Status | Acceptance evidence |
|---|---|---|---|---|
| build123d | https://github.com/gumyr/build123d | CAD provider / geometry authoring | research | Pinned environment; deterministic parameterized part; STEP export/reload; B-rep validity; dimensions and volume within tolerances; timeout and resource-limit tests |
| mcp-build123d | https://github.com/superWorldSavior/mcp-build123d | CAD tool adapter / integration reference | research | Tool schemas, provenance, artifact hashes, safe file access, prompt-injection/tool-abuse review, sandbox proof, error and timeout behavior |
| CadQuery | https://github.com/CadQuery/cadquery | Alternative CAD backend | research | Same neutral CAD acceptance suite as build123d; compare model fidelity, execution cost, reproducibility, compatibility and maintenance burden |
| mcp-calculix | https://github.com/superWorldSavior/mcp-calculix | FEA orchestration adapter | research | Inspect implementation and license; isolate solver; validate units/materials/loads/constraints; preserve input deck, mesh, solver version, logs and results |
| Gmsh | https://gitlab.onelab.info/gmsh/gmsh | Mesh generation runtime/library | research | Reproducible mesh settings; mesh-quality gates; geometry-to-mesh traceability; known-answer benchmarks; license and deployment review |
| CalculiX examples | https://github.com/calculix/examples | FEA benchmark/reference suite | research | Select benchmark cases with independent analytical or trusted reference answers; define tolerances and solver/version provenance |
| sim-cli | https://github.com/svd-ai-lab/sim-cli | Existing CAE context/diagnostics adapter candidate | research | Verify actual upstream, supported formats, license and maturity; fixture-based extraction; ensure extracted settings are labeled context, not validity proof |
| predictive-maintenance-mcp | https://github.com/LGDiMaggio/predictive-maintenance-mcp | Separate reliability/condition-monitoring capability | research | Known healthy/fault signals; sensitivity/specificity and false-alarm reporting; signal provenance; uncertainty and out-of-distribution behavior; no unsupported diagnosis claims |

## Priority 1 — bounded alternative-provider comparison

| Candidate | Canonical URL | Role | Status | Acceptance evidence |
|---|---|---|---|---|
| FreeCAD | https://github.com/FreeCAD/FreeCAD | Alternative CAD runtime | research | Headless execution and packaging; create/edit/export/reload; geometry validation; resource isolation; license and plugin inventory |
| FreeCAD MCP | https://github.com/neka-nat/freecad-mcp | CAD tool adapter | research | Compare against the existing provider contract; reject redundant adapter unless it improves verified coverage |
| Onshape MCP | https://github.com/hedless/onshape-mcp | Hosted CAD adapter | research | Verify canonical repo and current maintenance; API scopes, tenant isolation, secret handling, rate limits, audit trail and approval gates |

## Priority 2 — foundational and domain libraries

| Candidate | Role | Status | Gate before adoption |
|---|---|---|---|
| OCCT / OCP | Geometry kernel / bindings | research | Runtime compatibility, packaging, licensing, geometry fixtures and stable artifact contract |
| CodeToCAD / PartCAD | CAD orchestration and package/assembly patterns | research | Upstream/license verification; study patterns before considering code reuse |
| CADGate / constraint-solving tools | CAD validation and constraints | research | Confirm project status, license and actual supported checks; reference-only until benchmarked |
| mcp-syson | Requirements / MBSE integration | research | Versioned requirements and traceability contract; source/target identity and permission review |
| CoolProp / fluids / thermo / Pint | Thermophysical properties, fluid calculations and units | research | Unit-safe inputs; reference values; domain and range checks; versioned data and provenance |
| PyNite / section-properties | Structural analysis and section properties | research | Analytical benchmarks, unit tests, assumptions and documented applicability limits |

## Priority 3 — expand only for validated product demand

| Capability | Candidates | Gate |
|---|---|---|
| CFD / multiphysics | PhysicsNeMo, SU2, DOLFINx, Elmer FEM | Named use case, reproducible baseline, mesh/time-step/convergence controls and independent reference |
| Robotics / dynamics | Pinocchio, Project Chrono, MuJoCo Menagerie | Supported use case, model/data license review, deterministic benchmark and safe execution limits |
| Perception / scan processing | Open3D, OpenCV, Anomalib | Dataset rights, fixture set, accuracy limits, confidence calibration and failure-case reporting |
| Additive manufacturing | PrusaSlicer, CuraEngine, OctoPrint | Distribution-license review; toolpath checks; machine actions disabled absent explicit authorization |
| Digital twins | Eclipse Ditto | Identity, telemetry freshness, command authorization, replay protection and auditability |
| Physics-ML / surrogates | DeepXDE, NeuralOperator, AutoCFD | Dataset/checkpoint licensing, domain applicability, calibration, out-of-distribution checks and validated-solver fallback |

## Required promotion record

For every candidate considered beyond research, record:

1. Canonical repository URL and any redirect from the originally supplied URL.
2. Exact commit SHA or release tag and review date.
3. License file path, SPDX identifier where clear, dependency/license scan, notices and commercial-distribution decision. Use `unknown` rather than guessing.
4. Maintenance evidence: latest release/commit, open critical issues and supported runtime versions.
5. Threat review: arbitrary code, network/file access, credentials, untrusted artifacts, dependency provenance and resource exhaustion.
6. Adapter contract and the exact product capability it fills.
7. Reproducible benchmark fixtures, expected results, tolerances, environment and run link.
8. Decision owner, status, operational owner, rollback/disable method and next review date.

## Current decision

No candidate in this initial registry is marked supported. The prior inventory is a triage input, not evidence that every repository, license, build, or engineering result has been independently verified. Start with the three controlled pilots in Priority 0 and do not add runtime dependencies until their gates are met.
