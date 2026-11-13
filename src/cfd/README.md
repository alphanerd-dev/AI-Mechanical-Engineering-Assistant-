# OpenFOAM 14 CFD contract

This increment establishes an experimental provider contract and an independent analytical benchmark. It does **not** include or claim a deployed OpenFOAM worker.

## Supported case

The only accepted case is `laminar-channel-poiseuille-v1`: steady, incompressible, Newtonian, laminar plane-Poiseuille flow between parallel no-slip plates, with a fixed mean inlet velocity and zero-gauge-pressure outlet.

The manifest intentionally excludes arbitrary OpenFOAM dictionaries, custom boundary-condition strings, user-supplied code and arbitrary solver selection. The first worker must generate case dictionaries from this typed manifest.

## Independent reference

For channel height (H), mean velocity \\(\bar U\\), density \\(\rho\\), kinematic viscosity \\(\nu\\), and channel length (L):

- Analytical axial velocity: \\(u(y)=6\bar U(y/H)(1-y/H)\\)
- Expected pressure drop: \\(\Delta p=12\rho\nu L\bar U/H^2\\)
- Hydraulic-diameter Reynolds number: \\(Re=2H\bar U/\nu\\)

The acceptance validator checks:
- Velocity-profile normalized RMSE no greater than 2% and maximum absolute error no greater than 5% of the analytical peak velocity
- Pressure-drop relative error no greater than 2%
- Inlet/outlet mass-flux imbalance no greater than 0.5%
- Final pressure and velocity residuals within the request tolerance
- Exact structured mesh cell count and SHA-256-addressed mesh, field and solver-log artifacts

These are prototype acceptance thresholds. They must be calibrated against mesh-refinement studies and independently reviewed before the capability is promoted beyond experimental status.

## Worker requirements

The future worker must:
- Use the OpenFOAM Foundation 14 runtime in a separately packaged process/container; do not link OpenFOAM into the TypeScript application.
- Generate case files only from the validated manifest and a versioned trusted template.
- Run with no network access, non-root UID, read-only root filesystem, isolated temporary workspace, bounded CPU/memory/disk, and a hard wall-clock timeout.
- Record OpenFOAM version, template digest, mesh settings, solver settings, residual history, mesh checks, mass balance and output hashes.
- Return mesh, velocity, pressure and solver-log artifacts with SHA-256 digests.
- Fail closed on non-convergence, mesh-check failure, missing fields, non-finite values or validation failure.

## Product boundary

No general-purpose CFD, turbulence model selection, multiphase flow, heat transfer, arbitrary geometry import, user-supplied dictionaries, production certification or autonomous design approval is claimed. The provider returns `UNAVAILABLE` until an isolated OpenFOAM 14 executor is configured.
