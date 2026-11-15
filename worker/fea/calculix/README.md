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


## Asynchronous execution API

The container entrypoint is now service.py. It exposes the common execution-worker contract:
- POST /v1/jobs — submit a bounded ExecutionRequest; request ID is the idempotency key.
- GET /v1/jobs/{id} — poll QUEUED, RUNNING, SUCCEEDED, FAILED or CANCELLED.
- DELETE /v1/jobs/{id} — request cancellation; the supervisor terminates the worker process group.
- GET /v1/jobs/{id}/artifacts/{relative-path} — retrieve an artifact from the job's confined artifact directory.
- GET /health — non-sensitive liveness check.

All non-health routes require Authorization: Bearer WORKER_API_TOKEN. The service refuses an unauthenticated non-loopback bind. Set WORKER_HOST, WORKER_PORT, WORKER_API_TOKEN and FEA_ARTIFACT_DIR at runtime. The Docker image exposes port 8090 and runs as the unprivileged feaworker user.

A repeated job ID with the same canonical request hash returns the existing job. Reusing an ID with different input is rejected. On service restart, queued/running jobs are marked FAILED with errorCode RECONCILIATION_REQUIRED; they are not automatically replayed. This avoids silently repeating a solver job whose prior process outcome may be ambiguous.

The current worker result and artifact manifest are returned through the execution result. Artifact files remain in the isolated worker volume; promotion into project-scoped Supabase evidence storage and signed user downloads are separate integration gates and are not claimed by this service.
