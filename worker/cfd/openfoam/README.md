# OpenFOAM 14 worker

This container runs one bounded CFD benchmark: steady, incompressible, laminar plane-Poiseuille flow in a half-channel with a no-slip wall, centreline symmetry and a uniform body-force source derived from the requested mean velocity.

It is **not** a general-purpose OpenFOAM interface. It accepts a typed JSON manifest only; it does not accept arbitrary case dictionaries, scripts, meshes or solver names.

## Build

From the repository root:

```sh
docker build -t ai-mechanical-engineering-assistant-openfoam:14 \
  -f worker/cfd/openfoam/Dockerfile worker/cfd/openfoam
```

The image installs the OpenFOAM Foundation 14 package from its official Ubuntu repository and runs as UID 10001. The image includes the OpenFOAM runtime and a Python standard-library HTTP service.

## Run with bounded isolation

The container starts an asynchronous job service on port 8091. It must remain on a private network and must be protected by a bearer token.

```sh
TOKEN="$(openssl rand -hex 32)"
mkdir -p ./openfoam-artifacts
chmod 700 ./openfoam-artifacts

docker run --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit 128 \
  --memory=2g \
  --cpus=2 \
  --tmpfs /tmp:rw,noexec,nosuid,size=1g \
  --env "WORKER_API_TOKEN=$TOKEN" \
  --env WORKER_HOST=0.0.0.0 \
  --env WORKER_PORT=8091 \
  --env OPENFOAM_ARTIFACT_DIR=/artifacts \
  --mount type=bind,src="$PWD/openfoam-artifacts",dst=/artifacts \
  --publish 127.0.0.1:8091:8091 \
  ai-mechanical-engineering-assistant-openfoam:14
```

In production, place the container on a private network, store the bearer token in a secret manager, and apply CPU, memory, disk, process and wall-clock limits at the orchestrator. Do not expose the worker directly to the public internet. The service refuses a non-loopback bind without a token.

## Asynchronous HTTP job contract

- `GET /health` — non-sensitive liveness check
- `POST /v1/jobs` — submit a bounded `ExecutionRequest`
- `GET /v1/jobs/{id}` — poll `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` or `CANCELLED`
- `DELETE /v1/jobs/{id}` — cancel a queued/running solver process
- `GET /v1/jobs/{id}/artifacts/{relative-path}` — retrieve allowlisted solver artifacts

All routes except health require `Authorization: Bearer WORKER_API_TOKEN`. Job ID is the idempotency identity: the same ID and canonical request returns the existing job; reuse with different inputs is rejected. The service persists job state atomically under the artifact volume. On restart, active jobs are marked `RECONCILIATION_REQUIRED` and are never automatically replayed.

The OpenFOAM solver runs in a separate process group with `shell=False`. Timeout/cancellation terminates the process group; request size, solver duration, mesh cardinality and artifact paths are bounded. The API returns the full solver result and artifact manifest. Artifact retrieval verifies path confinement; the TypeScript adapter independently validates the Poiseuille profile, integrated mass flow, residuals, solver version, mesh count and artifact metadata.

## Application integration boundary

The application exposes `cfd-worker` only through the durable execution queue. The route requires both `TASK.EXECUTE` and `EVIDENCE.WRITE`, and the worker uses an allowlisted capability, fixed OpenFOAM 14 runtime and typed laminar-channel manifest. The service API is not intended to be called directly by browser clients.

## Licensing

OpenFOAM is GPL-licensed. Any redistribution of this worker image must preserve the applicable GPL license notices and source-code obligations for the OpenFOAM components. The TypeScript application communicates with the solver as a separate process/service; this boundary is not a substitute for a proper license review.
