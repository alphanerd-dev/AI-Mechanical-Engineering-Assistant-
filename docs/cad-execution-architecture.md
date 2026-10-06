# CAD Execution Architecture

The application stack is TypeScript-first:

- Next.js: workspace/application shell
- React: engineering UI
- TypeScript: Engineering Core, orchestration, state, capability registry, provider SDK

External engineering runtimes remain execution backends.

## CAD pipeline

```
Engineering requirements
        ↓
CAD parameters
        ↓
CAD.CREATE_PART
        ↓
build123d / CadQuery provider
        ↓
CAD source artifact
        ↓
sandbox execution
        ↓
STEP / STL / 3MF
        ↓
CAD.VALIDATE_GEOMETRY
        ↓
OCCT / FreeCAD validation
        ↓
validated CAD artifact
        ↓
Onshape / other CAD system
```

## Why generate code?

For complex geometry, one self-contained parametric program is easier to reproduce, inspect, retry and version than dozens of low-level remote CAD operations.

The Engineering Core should therefore prefer **capability-level code generation** where appropriate.

The generated program is not automatically trusted. Execution and geometry validation are separate gates.

## Next.js integration

The Next.js application should call TypeScript server-side orchestration APIs. It should not execute arbitrary CAD or FEA code in the browser.

Recommended boundary:

```
React UI
  ↓
Next.js Route Handler / Server Action
  ↓
Engineering Core
  ↓
Capability Router
  ↓
Sandbox Executor
  ↓
CAD runtime
```

Long-running CAD/FEA jobs should eventually run in a worker/container rather than blocking a web request.

## Security

Generated CAD code is untrusted input. A production executor must use:
- isolated containers or sandboxes
- resource/time limits
- restricted filesystem access
- restricted network access
- explicit artifact output directories
- process termination
- audit logs

Do not execute model-generated Python directly inside the Next.js process.

## Current status

The repository currently defines TypeScript contracts and provider boundaries. Actual build123d/CadQuery/OCCT execution is a later runtime integration.
