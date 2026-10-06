# Next.js Engineering Workspace

The application layer is intentionally thin. Next.js and React provide the workspace; the TypeScript Engineering Core remains the source of engineering decisions.

## Boundaries

- React UI: requirements, analysis, CAD pipeline, evidence and approval surfaces.
- Next.js App Router: pages and server-side API boundaries.
- Engineering Core: state, intent, capability routing, calculations and gates.
- Providers: CAD, simulation, research and PLM adapters.
- External runtimes: isolated workers for Python/CAD/FEA execution.

## First API boundary

POST /api/engineering/benchmark runs the existing shaft-design benchmark through the TypeScript core. It is a server-side integration seam, not a production job system.

Generated Python/CAD source must not execute inside the Next.js request process. Long-running or untrusted execution belongs in isolated workers/containers with explicit resource limits and artifact handoff.

## UI principle

The workspace must expose engineering truth, not just chat:

1. What is known?
2. What is assumed?
3. What is calculated?
4. What is missing?
5. What evidence supports the decision?
6. What is blocked?
7. What action is next?
