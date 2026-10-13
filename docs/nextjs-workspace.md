# Next.js Engineering Workspace

The application layer is intentionally thin. Next.js and React provide the workspace; the TypeScript Engineering Core remains the source of engineering decisions.

## Boundaries

- React UI: requirements, analysis, CAD pipeline, evidence and approval surfaces.
- Next.js App Router: pages and server-side API boundaries.
- Engineering Core: state, intent, capability routing, calculations and gates.
- Providers: CAD, simulation, research and PLM adapters.
- External runtimes: isolated workers for Python/CAD/FEA execution.

## Dependency direction and enforcement

The repository dependency graph is checked in CI for import cycles, unresolved relative imports, and a small set of explicit layer-boundary rules:

- `app/` is the outer Next.js composition layer. Modules outside `app/` must not import app routes or pages.
- `src/` contains Engineering Core and provider modules; it must not import `app/` or React UI components from `components/`.
- `lib/` contains shared infrastructure and server adapters; it must not import the app layer, React components, or Engineering Core modules.
- `src/` may reach into `lib/` only through the existing `src/auth/supabase-service.ts` → `lib/supabase/server.ts` integration edge. New cross-layer edges require an explicit architecture review rather than silently expanding the exception list.
- `components/` may compose lower-level core/shared modules, but may not depend on app routes or pages.

The graph command reports boundary violations, and `npm run architecture:graph -- --strict` fails CI when any are present. The scan covers TypeScript/JavaScript under `app/`, `components/`, `lib/` and `src/`; it does not replace separate review of Python workers, container boundaries, SQL migrations, runtime configuration, or authorization behavior.

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
