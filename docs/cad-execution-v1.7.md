# V1.7 CAD Execution Foundation

## Boundary
Generated CAD source is untrusted input. It must execute outside the Next.js process in an isolated CAD worker.

Flow:
Requirements → CAD parameters → CAD source → isolated worker → STEP/STL/3MF → independent geometry validation → accepted CAD artifact → engineering evidence.

## Allowed runtimes
- build123d
- CadQuery

## Worker policy
- network disabled by default
- read-only source filesystem plus controlled artifact directory
- explicit timeout
- capability and backend allowlist
- process termination on timeout
- audit/log capture
- no arbitrary shell execution

## Acceptance
Successful code execution is not engineering acceptance. Geometry must be independently checked for validity/topology before promotion to accepted engineering evidence.

## Current limitation
V1.7 currently defines the worker contract and safety boundary. It does not claim that build123d, CadQuery, OCCT, or FreeCAD are executing inside CI or Next.js.