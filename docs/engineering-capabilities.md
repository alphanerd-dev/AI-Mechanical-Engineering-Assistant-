# Engineering Capabilities and Provider Maturity

**Purpose:** Describe what exists in the repository without confusing a contract, prototype or catalog entry with a reachable, accepted production capability. The capability catalog in source remains authoritative for individual IDs and declared maturity; this document summarizes current boundaries and notable exclusions.

## Maturity vocabulary

- **EXPERIMENTAL:** contract or early implementation; not yet a supported production promise.
- **PILOT:** bounded path exists but still requires capability-specific acceptance, runtime configuration or evidence before wider promotion.
- **VERIFIED:** only the narrowly defined capability whose acceptance/evidence gate has passed. Never infer this status from an overall provider or project label.
- **BLOCKED / DEPRECATED:** do not execute while blocked or deprecated.
- **Provider availability:** installation, authentication, license, endpoint reachability, pinned runtime, permissions and resource limits must be checked separately from catalog status.

## Core workflow and workspace

The repository has a Next.js/React/TypeScript workspace, Supabase authentication and project-scoped persistence, optimistic revision checks, a provider-neutral capability catalog/router, structured project conversation sessions, task/workflow contracts, authorization and audit boundaries.

The current engineering-intent route can use a deterministic interpreter and has an optional server-side model-backed interpretation transport. A separate reasoning workbench creates structured task/framework proposals through a configurable structured-output model transport. These are not yet the selected assistant-ui streaming chat experience. See the [reasoning-model provider stack](reasoning-model-provider-stack.md) for the new chat direction.

The workspace must expose truth about missing inputs, execution, validation, evidence and approval. A task graph, an agent or a model must not bypass the core capability, risk, project and approval rules.

## Deterministic calculations and constraints

Existing capability families include shaft torque, preliminary solid-shaft sizing, unit conversion and dimensional checks, numerical/symbolic solving, bounded optimization, constraint evaluation/solving, cross-validation and tolerance workflows.

The shaft torque relation is T = P / ω, where ω = 2πn/60. Preliminary shaft sizing is only an initial calculation under its declared loading and material assumptions. It does not replace complete shaft analysis of fatigue, stress concentrations, deflection, critical speed, bearings, keys, tolerances or applicable standards.

The constraint foundation supports bounded explicit inputs; a solved system is not a safety verdict. An incomplete search or reached sample limit must not be presented as an exhaustive optimum. Units, domains, missing inputs and assumptions remain explicit.

## Pump hydraulic and shaft power — PILOT

The current M0 feature branch adds a deterministic pump-power calculator using explicit fluid density, volume flow rate, total dynamic head, and pump efficiency. Supported units are kg/m³ or g/cm³; m³/s, L/s or m³/h; and metres or feet. The service converts to SI, applies P_h = rho * g * Q * H and P_shaft = P_h / eta, and records assumptions and normalized inputs.

A separate capability-specific validator independently recomputes unit conversions and the governing relations. The resulting calculation artifact carries SHA-256 digests for canonical input/output JSON, a versioned validation receipt bound to those digests, execution status, validation status, approval status, verification status, source/workspace revisions, and limitations. The protected project-workspace route persists the artifact through its existing optimistic revision check; the event links to the artifact.

**Maturity is PILOT, not general pump-selection or design verification.** A passing receipt establishes only that the declared inputs, conversions and equations are internally consistent under the documented assumptions. It does not establish a correct duty point, system curve, NPSH margin, cavitation adequacy, pump selection, motor/drive sizing, or field performance. It does not mark the result approved or VERIFIED. Automated unit, invalid-input, tamper-detection and digest-binding tests exist in the feature branch; treat the integration as unverified until current-commit CI and isolated authenticated E2E acceptance pass.

## CAD and geometry

The reference CAD completion path is intentionally bounded to explicitly dimensioned cylindrical parts such as shafts/cylinders:

Supported lifecycle: typed intent → deterministic build123d generation → isolated worker → artifact registration → independent OCCT BREP validation → validation receipt and evidence bound to exact artifact bytes and project/model/execution lineage.

The current CAD workspace provides model identities, completion submission/history, readiness checks, artifact references, evidence status and decision/recovery messaging. It is not yet a complete interactive browser CAD viewer.

The wider catalog includes CAD generation, geometry validation, geometry diff/comparison, wall-thickness and DFM checks, candidate ranking and STEP export adapters. Their existence does not imply a complete general-purpose CAD pipeline or automatic validation of every export format. A BREP receipt validates the exact BREP bytes covered by that receipt; STEP/STL/3MF derivatives need appropriate independent checks before they can be described as validated.

The correction loop is bounded and always separates execution from independent geometry validation. Invalid geometry creates a controlled retry opportunity, not a successful engineering outcome. See the [verified CAD workspace contract](v2-1-6-cad-verified-workspace.md) and [CAD correction loop](cad-correction-loop.md).

## FEA and simulation

The repository declares provider-neutral mesh generation with Gmsh (documented pilot version 4.15.2) and static structural analysis with CalculiX (documented pilot version 2.20) plus Ansys PyMechanical adapter/worker contracts. The documented reference case uses linear first-order tetrahedra.

The current pilot's execution-integrity checks can establish items such as process completion, a non-empty mesh and finite requested outputs. They do not independently establish adequate mesh convergence, correct geometry/material/loads/supports/contacts, physical-model adequacy or structural safety. General CAD-to-mesh ingestion and arbitrary solver-deck generation remain gated work.

Other catalog entries cover OpenModelica simulations, parameter sweeps and sensitivity, multibody dynamics and solver comparisons. Treat them as experimental/pilot until the specific runtime and benchmark evidence for the requested capability have been checked. See [Open FEA execution](fea-engine-v1.18.md).

## Research and verification

Research providers can retrieve source-backed findings, but neither source authority nor model confidence automatically makes a claim VERIFIED. Keep source IDs, source identity, publication/version context and the verification method.

Applicable methods include source inspection, independent calculation, manufacturer confirmation and explicit human review. Engineering memory and requirement verification must accept only the evidence status allowed by their contracts. A missing source or unperformed check stays visible.

## Physical perception / point clouds

The repository documents a bounded point-cloud inspection/registration foundation and Open3D prototype. Input formats, unit normalization, coordinate frames, file/point limits, source digests and explicit registration thresholds are part of the contract.

A numeric ICP result is a registration candidate, not dimensional conformity, completeness or design approval. Authenticated upload/persistence, known-transform/noise/outlier benchmarks, secure artifact storage and human review are separate promotion gates. Do not call the feature production-ready based on a prototype or a pending change.

## Other catalog families

The catalog also contains pilot/experimental interfaces for robotics asset conversion/validation, manufacturing-process and inspection checks, digital-thread relationships and PLM item/revision/change-impact tasks. Before execution in a deployment, verify each provider's runtime, configuration, source/license review, isolation, test fixtures, independent validation, evidence and rollback.

## Cross-cutting acceptance requirements

Before expanding a capability's user-facing scope, define supported input/output schemas, physical assumptions and units, limits, a trusted known-answer or reference case, negative paths, time/resource limits, project authorization, artifact/evidence provenance, runtime version, operator/reviewer requirements and rollback. Measure real outcomes before claiming accuracy improvements, safety, productivity or cost savings.
