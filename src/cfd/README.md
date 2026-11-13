# OpenFOAM 14 CFD contract

This increment defines an experimental provider contract, a deterministic case manifest and an independent analytical benchmark validator. The worker implementation is a separate delivery step; until it is configured, the provider returns `UNAVAILABLE` and does not claim to execute a solver.

## Supported case

The only accepted case is `laminar-channel-poiseuille-v1`: steady, incompressible, Newtonian, laminar plane-Poiseuille flow between parallel no-slip plates. The initial worker uses a half-channel domain with a symmetry plane at the centreline and a uniform, versioned body-force source. The source acceleration is derived from the requested mean velocity and viscosity; arbitrary OpenFOAM dictionaries and user-supplied code are not accepted.

## Independent reference

For full channel height \\(H\\), mean velocity \\(\bar U\\), density \\(\rho\\), kinematic viscosity \\(\nu\\), and extrusion depth \\(b\\):

- Analytical axial velocity: \\(u(y)=6\bar U(y/H)(1-y/H)\\), sampled over the lower half-channel \\(0\le y\le H/2\\)
- Expected mass flow: \\(\dot m=\rho\bar U H b\\)
- Hydraulic-diameter Reynolds number: \\(Re=2H\bar U/\nu\\)
- Required body-force acceleration: \\(a_x=12\nu\bar U/H^2\\)

The request is deliberately bounded: mean velocity 1e-4–100 m/s, channel height/depth 1e-4–10 m, density 0.1–20000 kg/m3, kinematic viscosity 1e-9–1e-2 m2/s, 20–200 vertical cells, 50–10000 solver iterations, residual tolerance 1e-10–1e-3, and a 5–600 second worker timeout.

The acceptance validator checks:
- Velocity-profile normalized RMSE no greater than 2% and maximum absolute error no greater than 5% of the analytical peak velocity
- Integrated mass-flow relative error no greater than 0.5%
- Final pressure and velocity residuals within the requested tolerance
- Exact structured half-channel mesh cell count and SHA-256-addressed mesh, field and solver-log artifacts

These are prototype acceptance thresholds. They must be calibrated against mesh-refinement studies and independently reviewed before the capability is promoted beyond experimental status.

## Worker requirements

The future worker must:
- Use the OpenFOAM Foundation 14 runtime in a separately packaged process/container; do not link OpenFOAM into the TypeScript application. OpenFOAM is GPL-licensed; any worker-image distribution must preserve the applicable source and license notices.
- Generate case files only from the validated manifest and a versioned trusted template.
- Run with no network access, non-root UID, read-only root filesystem, isolated temporary workspace, bounded CPU/memory/disk, and a hard wall-clock timeout.
- Record OpenFOAM version, template digest, mesh settings, source term, solver settings, residual history, mesh checks, integrated flow rate and output hashes.
- Return mesh, velocity, pressure and solver-log artifacts with SHA-256 digests.
- Fail closed on non-convergence, mesh-check failure, missing fields, non-finite values or validation failure.

## Product boundary

No general-purpose CFD, turbulence model selection, multiphase flow, heat transfer, arbitrary geometry import, user-supplied dictionaries, production certification or autonomous design approval is claimed. The first benchmark is a bounded laminar numerical acceptance case, not a general CFD workbench.
