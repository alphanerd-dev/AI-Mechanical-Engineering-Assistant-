# Engineering Capabilities and Provider Maturity

**Purpose:** Describe what exists in source and in the tested workflows without confusing a contract, prototype, catalog entry, successful build or reachable provider with a production-ready engineering capability. The source capability catalog remains authoritative for individual IDs and declared maturity.

## Maturity vocabulary

- **EXPERIMENTAL:** contract or early implementation; not a supported production promise.
- **PILOT:** bounded path exists but still requires capability-specific acceptance, runtime configuration or evidence before wider promotion.
- **VERIFIED:** only the narrowly defined capability whose acceptance/evidence gate has passed. Never infer this status from an overall provider or project label.
- **BLOCKED / DEPRECATED:** do not execute while blocked or deprecated.
- **Provider availability:** installation, authentication, license, endpoint reachability, pinned runtime, permissions and resource limits are checked separately from catalog status.

## Workspace, identity and conversation

The repository has a Next.js/React/TypeScript workspace, Supabase authentication, protected project APIs, project/workspace persistence, optimistic revision checks, a provider-neutral capability catalog/router, structured project conversation sessions, task/workflow contracts, authorization and audit boundaries.

The conversational assistant is implemented with assistant-ui and Vercel AI SDK. It streams from an authenticated project route using the official Google/Gemini provider. The client uses Streamdown for Markdown and code, a math plugin and KaTeX for engineering equations. Project identity scopes the remote conversation thread and the existing project conversation/session APIs supply history.

The UI supports Markdown headings, emphasis, links, code blocks, tables, currency-safe text and inline/display equations. It includes edit, copy, regenerate and stop-generation controls. The authenticated browser acceptance test exercises the streamed UI path using a controlled mocked response.

**Important boundary:** chat is conversational. It may explain concepts, compare options, identify missing inputs and work through ordinary analytic calculations in its response. It does not execute CAD/FEA, shell/Python, privileged engineering tools, project mutations or formal validations. The separate Engineering Core interaction panel is the explicit route to registered deterministic workflows. The LLM's words are not an evidence or validation record.

The current route defaults to `gemini-3.5-flash-lite`; a valid server-side API key is required for real model responses. A mocked browser stream does not prove live provider credentials, model quality, quota, latency or cost.

## Deterministic calculations and constraints

Existing capability families include shaft torque, preliminary solid-shaft sizing, unit conversion and dimensional checks, numerical/symbolic solving, bounded optimization, constraint evaluation/solving, cross-validation and tolerance workflows.

The shaft torque relation is T = P / omega, where omega = 2 pi n / 60. Preliminary shaft sizing is only an initial calculation under its declared loading and material assumptions. It does not replace complete shaft analysis of fatigue, stress concentrations, deflection, critical speed, bearings, keys, tolerances or applicable standards.

The constraint foundation supports bounded explicit inputs; a solved system is not a safety verdict. An incomplete search or reached sample limit must not be presented as an exhaustive optimum. Units, domains, missing inputs and assumptions remain explicit.

## Pump hydraulic and shaft power — PILOT

The source includes a deterministic pump-power calculator using explicit fluid density, volume flow rate, total dynamic head and pump efficiency. Supported units include kg/m3 or g/cm3; m3/s, L/s or m3/h; and metres or feet. The service converts to SI, applies P_h = rho * g * Q * H and P_shaft = P_h / eta, and records assumptions and normalized inputs.

A separate capability-specific validator independently recomputes unit conversions and governing relations. The calculation artifact carries SHA-256 digests for canonical input/output JSON and a versioned validation receipt bound to those digests, execution status, validation status, approval/verification state, source/workspace revisions and limitations. The protected project-workspace route persists the artifact through its optimistic revision contract.

**Maturity is PILOT, not general pump selection or design verification.** A passing receipt establishes only that the declared inputs, conversions and equations are internally consistent under the documented assumptions. It does not establish a correct duty point, system curve, NPSH margin, cavitation adequacy, pump selection, motor/drive sizing or field performance. It does not imply approval or VERIFIED status.

## CAD and geometry

The accepted reference CAD path is intentionally bounded to explicitly dimensioned cylindrical parts such as shafts/cylinders:

typed intent -> deterministic build123d generation -> isolated remote worker -> artifact registration -> independent OCCT BREP validation -> validation receipt/evidence bound to exact artifact bytes and project/model/execution lineage.

The remote worker independently checks an allowlisted deterministic source template and constructs the supported cylinder; it does not execute arbitrary caller-supplied Python. Readiness, request/size/time limits, digests and private artifact persistence are separate gates.

The wider catalog includes CAD generation, geometry validation, geometry diff/comparison, wall-thickness and DFM checks, candidate ranking and STEP export adapters. Their existence does not imply a complete general-purpose CAD pipeline or automatic validation of every export format. A BREP receipt validates only the exact BREP bytes covered by that receipt; STEP/STL/3MF derivatives need applicable independent checks.

There is no complete interactive browser CAD viewer in the current chat increment. See [Verified CAD Workspace](v2-1-6-cad-verified-workspace.md) and [CAD Correction Loop](cad-correction-loop.md).

## FEA and simulation

The repository includes a reference open structural-analysis path using Gmsh 4.15.2, C3D4 tetrahedral mesh generation and CalculiX 2.20. The deterministic benchmark is `cantilever_box`; the worker does not accept arbitrary generated solver decks in this reference version. It normalizes solver completion, mesh counts, maximum displacement, von Mises stress, reaction forces and artifact hashes.

Execution-integrity checks can establish process completion, a non-empty mesh and finite outputs. They do not independently establish mesh convergence, correct geometry/material/loads/supports/contacts, physical-model adequacy or structural safety. There is no complete connected browser FEA field viewer yet. See [Open FEA execution](fea-engine-v1.18.md).

Other catalog entries cover OpenModelica simulations, parameter sweeps and sensitivity, multibody dynamics and solver comparisons. Treat them as experimental/pilot until the specific runtime and benchmark evidence for the requested capability has been checked.

## Research and reasoning

The structured reasoning workbench produces advisory, schema-validated task/framework proposals through a separate server-side model transport. It does not execute capabilities, certify engineering results, mutate task state or approve work.

Research providers can retrieve source-backed findings, but source authority or model confidence does not automatically make a claim VERIFIED. Keep source IDs, source identity, publication/version context and verification method. Missing sources and unperformed checks remain visible.

## Physical perception / point clouds

The repository includes an isolated one-shot Open3D worker prototype for PLY, PCD and XYZ inspection and ICP registration. Units and coordinate-frame IDs are explicit; input path, file size, point count, request size, iteration count and source digests are bounded.

The prototype is not wired to a public authenticated upload endpoint, a project artifact registry or production routing. A numeric ICP result is a registration candidate, not dimensional conformity, completeness or design approval. Authenticated upload/persistence, known-transform/noise/outlier benchmarks, secure artifact storage and human review are separate promotion gates.

## Other catalog families

The catalog also contains pilot/experimental interfaces for robotics asset conversion/validation, manufacturing-process and inspection checks, digital-thread relationships and PLM item/revision/change-impact tasks. Verify each provider's runtime, configuration, source/license review, isolation, fixtures, independent validation, evidence and rollback before execution in any deployment.

## Cross-cutting acceptance requirements

Before expanding a capability's user-facing scope, define supported schemas, physical assumptions and units, limits, trusted reference cases, negative paths, time/resource bounds, project authorization, artifact/evidence provenance, runtime version, reviewer requirements and rollback. Measure real outcomes before claiming accuracy improvement, safety, productivity or cost savings.
