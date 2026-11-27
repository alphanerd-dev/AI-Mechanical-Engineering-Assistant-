# V1.18 — Open FEA engineering execution

## Scope

V1.18 adds the first real open-source FEA execution path without coupling the Engineering Core to a single commercial solver.

The runtime path is:

```
Engineering Core
   |
   +-- ANALYSIS.MESH -----------------> Gmsh
   |
   +-- ANALYSIS.STATIC_STRUCTURAL ----> CalculiX
   |
   v
normalized FEA result
   |
   v
execution-integrity validation
   |
   v
artifact + evidence bridge
```

The TypeScript layer owns provider-neutral contracts. The reference Python runtime proves the open toolchain in an isolated container.

## Evidence rule

A solver returning successfully means the computational run completed. It does not mean:
- the model is physically correct,
- boundary conditions are appropriate,
- material properties are correct,
- the mesh is converged,
- the design satisfies a requirement,
- the design is safe.

V1.18 therefore validates solver execution integrity only: successful exit, reported completion, non-empty mesh, and finite requested outputs.

## Reference runtime

- Gmsh Python package: 4.15.2
- CalculiX CrunchiX: 2.20
- linear first-order tetrahedra: C3D4
- deterministic cantilever-box benchmark
- artifact hashes recorded in worker output

Generic CAD-to-mesh ingestion and full arbitrary-model solver deck generation remain later provider/runtime work.


## Verification protocol revision v2 — 27 November 2026

The original CI cantilever case used a 100 × 20 × 20 mm specimen and an 8 mm first-order tetrahedral mesh. Its reported displacement relative error was 29.63% against a 30% ceiling. That was a marginal pass, not credible numerical verification evidence.

The v2 bounded regression uses a 200 × 20 × 20 mm steel cantilever, 1 kN transverse end load, and the same closed-form Euler–Bernoulli bending plus first-order Timoshenko shear reference. The worker's maximum accepted displacement relative error is reduced to 10%; support-reaction equilibrium remains limited to 1%. The analytical reference is versioned as `cantilever-box-euler-bernoulli-plus-timoshenko-v2` so old receipts are not silently reinterpreted.

CI additionally executes the same physical case with 4, 3 and 2 mm C3D4 mesh targets. It retains each raw worker response, solver artifact digest, mesh cardinality and measured/expected displacement. All three cases must satisfy the 10% displacement and 1% reaction limits, and the relative change between the two finest mesh results must not exceed 5%.

This is a regression and mesh-stability gate for one linear-elastic cantilever case. It does not establish mesh convergence for arbitrary geometry, stress singularities, nonlinear/contact behaviour, buckling, fatigue or design-code compliance. A passing result remains evidence only for the declared model, inputs, solver version and acceptance criteria.
