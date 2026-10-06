# Application Stack

## Primary stack

- Next.js
- React
- TypeScript

The web application and Engineering Core are TypeScript-first.

## Responsibilities

### Next.js
- application shell
- route handlers
- server-side orchestration endpoints
- authentication boundary
- job/status APIs
- artifact download/preview endpoints

### React
- project workspace
- engineering timeline
- requirements editor
- CAD artifact viewer shell
- simulation result panels
- evidence/traceability UI
- human approval gates

### TypeScript Engineering Core
- intent parsing
- project state
- engineering memory
- capability registry
- provider routing
- lifecycle gates
- traceability
- artifact metadata
- evidence model

### External runtimes

Python/C++ systems are backends, not the main application language:
- build123d
- CadQuery
- FreeCAD/OCCT
- Ansys Mechanical/PyMechanical
- numerical Python libraries

They communicate through explicit executor/provider contracts.

## Principle

Do not move engineering policy into provider-specific code.

The UI asks the Engineering Core what can be done. The core chooses a capability and provider. The provider adapter translates the request to the external runtime.
