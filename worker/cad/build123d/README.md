# build123d CAD worker

Transport: one JSON request on stdin and one JSON response on stdout.

## Request

Required fields:
- `id`
- `backend: build123d`
- `source`
- `filename`
- `timeoutMs`

Optional:
- `parameters`

## Artifact manifest

A successful generated program may write `cad-artifacts.json` inside `CAD_ARTIFACT_DIR`:

```json
{
  "schemaVersion": 1,
  "artifacts": {
    "solidArtifactPath": "part.brep",
    "stepArtifactPath": "part.step",
    "stlArtifactPath": "part.stl",
    "threeMfArtifactPath": "part.3mf"
  }
}
```

Only these artifact keys are accepted. Each declared path must resolve to an existing file inside the worker artifact directory. Path traversal and malformed manifests fail closed.

The source file path is always returned as `sourceArtifactPath`.

## Response

Fields may include:
- `success`
- `backend`
- `sourceArtifactPath`
- `solidArtifactPath`
- `stepArtifactPath`
- `stlArtifactPath`
- `threeMfArtifactPath`
- `stdout`
- `stderr`
- `warnings`
- `error`

## Runtime

The reference runtime pins `build123d==0.13.0`.

## Security boundary

- run outside the Next.js process
- non-root container
- runtime container should use `--network none`
- read-only root filesystem plus a dedicated writable artifact mount
- CPU, memory, PID and timeout limits enforced by the outer supervisor
- generated source is never executed directly by the web server
- manifest artifact paths are confined to the artifact directory

This is a reference runtime boundary, not a claim that arbitrary generated Python is intrinsically safe. Production deployment still needs container-level isolation and operational controls.
