# V1.4 Execution Layer

The execution layer separates engineering intent from runtime execution.

## Contract

`ExecutionRequest → ExecutionBackendAdapter → ExecutionResult → ExecutionJob`

A job contains:

- capability
- backend
- explicit inputs
- requested outputs
- timeout
- status
- result
- artifact IDs
- errors

## Units

Engineering values should carry explicit units. The initial TypeScript unit system supports a small deterministic set for the core benchmark.

A future production unit layer should use a mature dimensional-analysis library such as Pint in the Python worker and enforce dimensional compatibility before calculations.

## Security boundary

The Next.js server must not evaluate arbitrary model-generated Python, CAD code or shell commands.

The intended architecture is:

`Next.js → job queue → isolated worker → artifact store → validation → project state`

Workers need:

- CPU/time limits
- memory limits
- restricted filesystem
- controlled network access
- explicit input/output directories
- process termination
- audit records

## Current implementation

The repository currently includes a deterministic TypeScript numerical adapter. It proves the job contract without pretending that Python execution is already available.

## V1.4.1 Controlled Python worker

The repository now includes `worker/python/worker.py` and a TypeScript `PythonWorkerAdapter`. The worker uses a strict allowlist for `ANALYSIS.SHAFT_TORQUE` and `ANALYSIS.SHAFT_SIZE` and never evaluates arbitrary Python source.

`PythonProcessClient` communicates over stdin/stdout with `shell: false` and enforces a process timeout. This is a real external process boundary, but it is **not yet a production sandbox**. Production deployment still requires container isolation, resource limits, filesystem/network policy, queueing and stronger schema validation.

The next execution milestone is containerized worker execution plus artifact handling and validation.


## V1.4.2 Worker hardening baseline

Added a reference container and worker policy. The Python worker is intended to run non-root with a read-only filesystem, no network, dropped Linux capabilities, no-new-privileges, CPU/memory/process limits and an application-level capability/timeout allowlist. The TypeScript adapter now rejects requests that violate the Python numerical worker policy before starting the process.
