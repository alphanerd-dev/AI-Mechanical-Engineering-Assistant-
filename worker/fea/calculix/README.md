# Open FEA reference worker

V1.18 proves a real open structural-analysis path:

`Gmsh 4.15.2 -> C3D4 tetrahedral mesh -> CalculiX 2.20 -> normalized structural results`.

The worker currently uses a deterministic `cantilever_box` benchmark. It intentionally does not accept arbitrary generated solver decks in V1.18.

## Request

The smoke request contains:
- `analysis: STATIC_STRUCTURAL`
- `benchmark: cantilever_box`
- isotropic linear-elastic material inputs
- beam dimensions in mm
- target mesh size in mm
- total transverse force in N
- timeout in ms

## Outputs

The worker normalizes:
- solver completion and convergence state
- mesh node and element counts
- maximum displacement magnitude
- maximum von Mises stress
- summed reaction forces
- hashes and paths for the CalculiX input, DAT, FRD and STA artifacts

CalculiX writes ASCII tables through `*NODE PRINT` and `*EL PRINT`; those are parsed for the normalized values. The project keeps the FRD artifact for later post-processing/visualization.

## Security boundary

Run the worker in a non-root container. The outer supervisor should enforce:
- `--network none`
- read-only root filesystem
- a dedicated writable artifact directory
- CPU, memory and PID limits
- timeout enforcement

Solver convergence is not treated as a design-safety verdict. Engineering acceptance remains a separate validation/verification decision.
