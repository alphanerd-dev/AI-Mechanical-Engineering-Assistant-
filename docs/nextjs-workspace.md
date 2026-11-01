# Next.js Engineering Workspace

The application layer is the user-facing control plane. Next.js and React provide the workspace; the TypeScript Engineering Core remains the authority for deterministic engineering decisions.

## Current stack

- Next.js 16 App Router and React 19 with TypeScript.
- Supabase SSR/client integration for authentication and project-scoped persistence.
- assistant-ui for the project conversation interface.
- Vercel AI SDK for streamed chat transport.
- Official AI SDK Google provider for the current Gemini chat route.
- Streamdown, code/math plugins and KaTeX for message rendering.
- Vitest for unit/integration tests and Playwright for browser acceptance.

Pinned dependencies and scripts are in `package.json` and `package-lock.json`.

## Workspace composition

The project engineering page composes two distinct experiences:

- **Engineering chat:** project-scoped conversation, incremental response streaming, Markdown/math/code rendering, history restore and thread actions.
- **Engineering Core interaction:** an explicit task surface for registered deterministic operations, missing-input handling, execution state and validation/evidence decisions.

The Engineering Core panel is collapsed by default so the conversation is the primary surface. It remains a separate workflow. Chat does not invoke CAD, FEA, privileged tools or project mutations.

## Server/API boundaries

The chat POST endpoint is:

`/api/projects/[projectId]/engineering/chat`

The route validates project identity, checks server-side engineering authorization, validates the messages payload, rejects client-supplied provider/model/system/tool configuration and streams a Gemini response using server-side configuration. The demo sandbox is an explicit special case; registered project IDs use the normal project authorization path.

The project chat thread identity is the project ID. History is loaded/saved through the existing project conversation/session machinery. The thread list is fixed to one durable engineering conversation per project; it is not an unrestricted multi-thread workspace.

Other project, reasoning, execution and CAD routes retain their own contracts. UI components must not bypass them or infer that a model response is validated.

## Dependency direction and enforcement

The repository dependency graph is checked in CI for import cycles, unresolved relative imports and layer-boundary rules:

- `app/` is the outer Next.js composition layer. Modules outside `app/` must not import app routes or pages.
- `src/` contains Engineering Core and provider modules; it must not import `app/` or React UI components from `components/`.
- `lib/` contains shared infrastructure and server adapters; it must not import the app layer, React components or Engineering Core modules.
- `src/` may reach into `lib/` only through the existing `src/auth/supabase-service.ts` -> `lib/supabase/server.ts` integration edge. New cross-layer edges require explicit architecture review.
- `components/` may compose lower-level core/shared modules, but may not depend on app routes or pages.

Run `npm run architecture:graph -- --strict` to enforce the rules. The graph does not replace separate review of Python workers, container boundaries, SQL migrations, runtime configuration or authorization behavior.

## Build and tests

- `npm ci` installs the lockfile.
- `npm test` runs Vitest.
- `npm run build` runs `next build --webpack && tsc --noEmit`.
- `npm run test:e2e` runs Playwright after the pinned browser helpers and Chromium have been installed.
- `npm run worker:execution` starts the separate Node execution worker process.
- `npm run architecture:graph -- --strict` enforces dependency boundaries.

The protected E2E workflow is the supported path for authenticated staging tests. See [Playwright and live acceptance](playwright-e2e.md).

## Engineering truth in the UI

The workspace must expose:

1. What is known?
2. What is assumed?
3. What is calculated or executed?
4. What is missing?
5. What evidence supports the decision?
6. What is blocked or stale?
7. What action is next?

A chat explanation is not a deterministic calculation record, validation receipt, engineering approval or artifact.
