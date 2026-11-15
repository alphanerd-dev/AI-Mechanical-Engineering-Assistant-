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


## PR #168 worker-specific enforcement

- CalculiX accepts only the versioned cantilever-box benchmark. It rejects arbitrary benchmark identifiers, validates bounded numerical inputs, and resolves artifacts only beneath the validated job directory.
- OpenFOAM 14 accepts a fixed laminar-channel manifest, not arbitrary dictionaries. The service uses a fixed artifact-name allowlist and rejects absolute, traversal and symlink-escape paths.
- Both asynchronous HTTP worker services require bearer-token authorization when bound beyond loopback. Do not expose worker ports directly to untrusted networks; place them behind authenticated service-to-service networking.
- Restart recovery must not blindly replay a solver that may have been executing when its process was lost. Active jobs are marked for reconciliation and require an explicit recovery decision.
- Worker success is only an execution outcome. FEA/CFD acceptance must validate normalized results, analytical/reference checks, artifact digests and evidence lineage independently.
- Tests for path traversal, malformed paths, symlink escape, bounded requests, restart reconciliation and cancellation are present in the PR. Exact-head execution of those tests and container smoke suites remains a release gate.
