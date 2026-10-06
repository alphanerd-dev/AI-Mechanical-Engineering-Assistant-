# CAD correction loop

The CAD correction loop is a bounded orchestration layer between CAD execution and independent geometry validation.

## Flow

1. Submit generated CAD source to an isolated CAD worker.
2. If execution fails, capture the structured error.
3. If execution succeeds, run independent geometry validation.
4. If validation fails, capture the validation warnings/blocking reasons.
5. Ask a correction strategy for a revised source.
6. Retry up to a configured maximum.
7. Return the complete attempt history and final source.

## Safety boundary

The loop does not execute generated CAD code inside Next.js.

The worker remains responsible for isolation, resource limits, filesystem policy, and network policy. The correction loop only orchestrates requests through the CADWorkerExecutor contract.

The default recommended maximum is three attempts. A caller must explicitly provide a different value, and the implementation rejects values above five.

## Evidence

A successful execution is not engineering acceptance.

The source must still pass independent geometry validation before it can be accepted. Validation failure produces a retry opportunity, not a success signal.

## Future extension

A production implementation can add structured diagnosis categories such as:

- syntax/runtime failure
- unsupported CAD operation
- missing parameter
- invalid topology
- zero-volume result
- self-intersection
- unit/scale anomaly
- export failure

Those diagnoses can drive targeted correction strategies without coupling the engineering core to a particular CAD backend.