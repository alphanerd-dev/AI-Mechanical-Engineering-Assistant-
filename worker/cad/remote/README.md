# Remote CAD worker

This service is intended to run as a separately deployed, unprivileged container. The Vercel application talks to it over HTTPS with a server-only 256-bit bearer token. It does not accept arbitrary Python execution or caller-selected image references, file paths, executable names, or shell commands.

## API

- `GET /healthz` is an unauthenticated liveness endpoint and reveals no secrets.
- `GET /v1/readiness` requires bearer authentication and reports runtime readiness.
- `POST /v1/cad/execute` accepts only the existing deterministic cylinder/shaft specification and the exact source template emitted by `Build123dIntentCodeGenerator`. The worker **does not execute the supplied source**. It independently checks the template and constructs only the allowlisted cylinder via build123d in a child process.
- `POST /v1/cad/validate` requires a BREP and expected SHA-256 digest. The worker verifies the digest and launches the existing read-only OpenCascade validator in a separate process. It returns measured volume, bounding box, dimension checks and its SHA-256 digest.

The worker caps request size, per-artifact size, total output size, concurrency, and execution time. Validation is performed against the exact BREP bytes and the client rechecks the digest before acceptance and persistence.

## Free-plan caveats

Render's free service can sleep when idle and does not provide durable local artifact storage. This design returns bounded artifact bytes directly to the Vercel application, which verifies their digests and persists accepted artifacts into the existing private Supabase Storage bucket. A sleeping service may add cold-start latency; this service should be upgraded or moved to durable worker infrastructure before relying on production availability or higher-throughput workloads.

This is a first bounded CAD completion worker, not a general-purpose CAD interpreter. It supports cylindrical shafts/cylinders only. A positive geometry verdict is not design approval or a complete mechanical safety assessment.
