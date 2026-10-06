# Worker Security Policy

Workers execute bounded engineering capabilities outside the Next.js process. They are execution infrastructure, not trusted extensions of the AI.

## Required production controls

1. Allowlist capabilities; never accept arbitrary source code as a capability.
2. Container isolation or an equivalent sandbox.
3. No network by default for numerical workers.
4. Read-only root filesystem with explicit artifact locations.
5. Drop unnecessary Linux capabilities.
6. Run as non-root and prevent privilege escalation.
7. Enforce CPU, memory, process-count and wall-clock limits.
8. Restrict writes to approved artifact locations.
9. Validate request and response schemas before engineering validation.
10. Record job ID, capability, backend, timing, status and evidence/artifact identifiers.

The repository provides a reference Docker configuration and process-level Python adapter. This is a hardening baseline, not a claim that every deployment is secure by default.

The same policy should apply to Python numerical, CAD/build123d, FreeCAD/OCCT, Ansys/PyMechanical and manufacturing workers.
