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
