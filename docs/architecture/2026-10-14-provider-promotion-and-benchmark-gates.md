# Provider promotion, benchmark, and source-reuse gates

**Decision date:** 14 October 2026  
**Purpose:** close the P5 architecture-review gate without turning the repository inventory into an unreviewed runtime dependency list.

## Non-negotiable rule

A repository being public, popular, or runnable does not make it an approved engineering provider. External code execution, solver exit status, model output, UI display, and a plausible result are not engineering verification.

A provider moves from EXPERIMENTAL/PILOT to VERIFIED only after its exact source revision, licensing/dependency closure, isolated runtime, shared known-answer benchmark, independent validator, security review, retained evidence, and human approval all pass. The router rejects BLOCKED/DEPRECATED providers and fails closed if a provider claims VERIFIED without the required evidence fields. It intentionally does not disable unrelated EXPERIMENTAL/PILOT providers globally.

## Shared CAD fixture contract

The workflow `.github/workflows/provider-benchmarks.yml` executes the same fixtures from `benchmarks/providers/cad-fixtures-v1.json` in isolated pinned environments:

| Fixture | Analytic truth | Acceptance checks |
|---|---|---|
| Rectangular block, 20 × 10 × 5 mm | 1,000 mm³ | Positive/valid one-solid topology, dimensions, STEP export/import, volume |
| Cylinder, radius 5 mm, height 20 mm | 500π = 1,570.7963268 mm³ | Same checks, plus round-trip |
| Plate, 80 × 60 × 5 mm, through-hole radius 8 mm | 22,994.6903509 mm³ | Boolean/topology result, dimensions, STEP export/import, volume |

Volume tolerance is max(0.001 mm³, 0.01% of the analytic answer); bounding-box tolerance is 0.01 mm. Fixture manifest SHA-256, provider package version, workflow revision, STEP byte length/hash, original measurements, and round-trip measurements are captured in retained per-provider reports. A failed fixture fails the workflow. Both providers are measured against the same inputs, not against each other's outputs.

This is deliberately a small geometry regression gate, not a broad CAD certification, manufacturing release, or structural safety claim.

## Inventory disposition and source/reuse review

| Inventory candidate | Current disposition | Reference/reuse plan and promotion blocker |
|---|---|---|
| [build123d](https://github.com/gumyr/build123d) | PILOT; installed runtime pinned to 0.13.0 | Upstream source advertises Apache-2.0. Shared geometry/STEP suite plus the existing separate OCCT BREP validator are required. Runtime image still needs an immutable digest; transitive license closure and security review are incomplete. Use package/runtime APIs through the existing worker boundary, not copied internal source. |
| [CadQuery](https://github.com/CadQuery/cadquery) | EXPERIMENTAL benchmark-only comparator at 2.8.0 | Upstream advertises Apache-2.0. Run the exact same shared fixtures in a separate, network-disabled image. This benchmark does not register CadQuery as a product runtime. Dependency/license closure and security review remain required. |
| [Gmsh](https://gitlab.onelab.info/gmsh/gmsh) + CalculiX | PILOT reference worker | The current worker pins Gmsh 4.15.2 and CalculiX 2.20 package revision. Gmsh source is GPL-2.0-or-later with an upstream linking exception; closed-source redistribution/integration must not be assumed permissible. The new reference check compares a cantilever's calculated deflection to independent Euler–Bernoulli bending plus a first-order Timoshenko shear estimate and checks support-reaction equilibrium. Mesh/convergence studies, per-run mesh/load/BC/material provenance, full license review, and a retained passing reference run remain required. |
| [CalculiX-Examples](https://github.com/calculix/CalculiX-Examples) | Benchmark/reference only | Its public page identifies MIT license and parametric examples. Inspect each chosen example and its license/header before reuse; do not copy the whole repository. Prefer independently derived analytical answers for the primary regression fixture, and use upstream examples as a second comparator with exact commit and provenance. The broader [official/user examples collection](https://github.com/calculix/examples) has mixed contents; do not infer one license covers every nested contribution. |
| [mcp-build123d](https://github.com/superWorldSavior/mcp-build123d) | Reference-only, not integrated | Any tool that executes caller-supplied Python or shell-equivalent operations is outside the product's trusted execution boundary. Do not copy its executable workflow or expose it directly. If useful, extract requirements from docs and implement a clean-room, schema-validated adapter to the isolated worker. Review exact source revision, license and dependencies first. |
| [mcp-calculix](https://github.com/superWorldSavior/mcp-calculix) | Reference-only, not integrated | Reuse only public workflow concepts after a commit-pinned source, interface, license, dependency and security review. The existing provider must keep explicit unit/material/mesh/load schemas and independent analytical acceptance. |
| [predictive-maintenance-mcp](https://github.com/LGDiMaggio/predictive-maintenance-mcp) | EXPERIMENTAL reference only | Upstream code is MIT, but upstream sample bearing-vibration data is CC BY-NC-SA 4.0 and is not approved for this commercial product. Do not import or redistribute that sample data. Use newly generated synthetic known-signal fixtures or separately licensed customer data; specify fault labels, sampling units, false-alarm/sensitivity metrics, provenance, uncertainty and OOD tests before considering integration. |
| FreeCAD/OCCT/Onshape/other ecosystem tools | Candidate/reference lanes | Do not bulk-copy source or add dependencies. First pin a revision, read the root and nested licenses, check dependency/security maintenance, test a bounded use case on the neutral contract, then review the exact adapter diff. |

## Rules for “copy workflows”

1. Copy the *workflow idea*, not code or data by default. Create a native adapter against this repository's provider contract, with an allowlisted schema and explicit artifact/evidence types.
2. For any proposed source reuse, record upstream repository + exact commit/tag, source license, notice obligations, transitive dependency license inventory, data licenses, security scan, copied file hashes, local modifications, and reviewer decision. Keep upstream copyright notices where required.
3. Do not copy a command-execution endpoint into a trusted core. Use bounded containers with no network, read-only root filesystem plus an artifact directory, unprivileged UID, resource ceilings, timeouts, and strict file confinement.
4. Benchmark fixtures must be independently specified and have analytical or trusted external reference answers. A provider is not allowed to serve as the only validator of its own output.
5. Store benchmark report JSON and CI run/artifact URLs; bind them to exact commit and fixture SHA-256. A report from an earlier commit does not validate the current commit.
6. Do not auto-promote based on test counts or a green process. Failed, excluded, missing, unlicensed, or unavailable checks remain visible.

## Provider promotion gate implementation

`src/providers/promotion-manifest.ts` defines a machine-checkable manifest. A VERIFIED claim is rejected by the capability router unless all these are true:

- source is HTTPS and revision is pinned; upstream license is explicitly cleared for intended use and dependency closure is reviewed;
- code reuse disposition is cleared, or a clean-room adapter's source is recorded;
- runtime image is digest-pinned, package version and resource ceilings are explicit, network access is disabled, filesystem is read-only plus artifacts, and process is unprivileged;
- shared known-answer benchmark passed and its fixture SHA-256, workflow URL, and retained artifact URL are provided;
- analytical/trusted reference and independently implemented validator both pass;
- security review has durable evidence and a named reviewer has explicitly approved with timestamp and evidence URL;
- known limitations are recorded.

The initial manifest intentionally leaves build123d at PILOT, CadQuery at EXPERIMENTAL, Gmsh/CalculiX at PILOT, and predictive-maintenance at EXPERIMENTAL. A passing CAD geometry suite alone cannot satisfy licensing, image-digest, security or reviewer gates, and cannot promote a provider to VERIFIED.

## FEA reference contract

The CalculiX worker continues to run only its bounded `cantilever_box` benchmark. For load in the negative Y direction at the X-end face:

- (I_z = h b^3 / 12)
- (delta_b = F L^3 / (3 E I_z))
- (G = E / (2(1 + \nu)))
- (delta_s = 6 F L / (5 G A))
- reference end displacement estimate is (delta_b + delta_s)

The mesh regression currently permits 30% relative displacement error because the reference mesh is intentionally coarse and uses linear tetrahedra; the contract also requires support-reaction equilibrium within 1%. This is a screening test, not mesh convergence evidence. Before VERIFIED status, add at least one mesh refinement study and an independently sourced analytical or published case with documented boundary conditions, material, element order, solver version and result tolerances.

## Evidence state

The benchmark workflow and reference checks have been added to this PR, but their CI run artifacts must pass on the final PR head before any provider status is revised. Until then the relevant suites are NOT_RUN, not PASS.
