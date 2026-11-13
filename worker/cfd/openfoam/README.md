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

```sh
TOKEN="$(openssl rand -hex 32)"
mkdir -p ./openfoam-artifacts
chmod 700 ./openfoam-artifacts

docker run --rm \
  --read-only \
  --network none \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit 128 \
  --memory=2g \
  --cpus=2 \
  --tmpfs /tmp:rw,noexec,nosuid,size=1g \
  --env "OPENFOAM_WORKER_TOKEN=$TOKEN" \
  --env OPENFOAM_ARTIFACT_DIR=/artifacts \
  --mount type=bind,src="$PWD/openfoam-artifacts",dst=/artifacts \
  -p 127.0.0.1:8080:8080 \
  ai-mechanical-engineering-assistant-openfoam:14
```

For a production deployment, place the worker on a private network, store the bearer token in a secret manager, and enforce CPU, memory, disk, process and wall-clock limits at the orchestrator. Do not expose the worker directly to the public internet.

## HTTP contract

- `GET /health` — readiness and pinned solver version
- `POST /v1/cfd/laminar-channel` — authenticated benchmark execution
- `GET /v1/cfd/artifacts/{jobId}/{filename}` — authenticated retrieval of a generated artifact

The POST body uses the `OpenFOAMLaminarChannelRequest` contract in `src/cfd/types.ts`. The worker rejects unknown fields and enforces the same numerical and resource bounds as the TypeScript provider.

Every successful run returns a job ID, solver version, convergence flag, mesh cell count, integrated mass flow, velocity profile, final residuals and SHA-256 digests for the mesh, velocity field, pressure field and solver log.

## Security and evidence

- Non-root execution (UID 10001)
- Bearer authentication for execution and artifact retrieval
- No arbitrary shell commands or user-provided OpenFOAM dictionaries
- Fixed utility allowlist: `blockMesh`, `checkMesh`, `foamRun`
- Per-request wall-clock timeout
- Temporary case workspace under `/tmp`
- Artifact download path whitelist and path traversal protection
- Mesh validation and independent analytical acceptance in the TypeScript provider
- CI smoke test runs the container with `--network none`, read-only root filesystem, dropped capabilities and bounded CPU/memory

The app-level provider remains unavailable until a durable execution adapter is configured. This worker image alone does not enable a production CFD route.

## Licensing

OpenFOAM is GPL-licensed. Any redistribution of this worker image must preserve the applicable GPL license notices and source-code obligations for the OpenFOAM components. The TypeScript application communicates with the solver as a separate process/service; this boundary is not a substitute for a proper license review.
