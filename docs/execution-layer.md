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

Next milestone: implement a real isolated Python worker for approved numerical capabilities.
