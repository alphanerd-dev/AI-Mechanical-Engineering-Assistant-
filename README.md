# AI Mechanical Engineering Assistant

A provider-backed Engineering Workspace and Engineering Core, starting with Mechanical Engineering. The project is designed to help engineers move from a problem statement to a usable, traceable result while keeping engineering execution, validation, evidence and approval under explicit control.

**Product rule:** AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.

## Current repository state

The repository currently contains:

- A Next.js App Router, React and TypeScript application with a Forge workspace shell, authenticated project routes, project-scoped persistence and Supabase SSR integration.
- A first-class streamed engineering conversation built with assistant-ui and Vercel AI SDK. The chat supports project-scoped history, incremental response streaming, Markdown, code blocks, tables, links, currency-safe text and inline/display LaTeX rendering.
- A separate Engineering Core interaction panel for registered deterministic workflows. It is deliberately distinct from conversational chat.
- Server-side Gemini chat integration through the official AI SDK Google provider. The default chat model is `gemini-3.5-flash-lite`; the server-side model name can be overridden. The browser cannot choose the provider, model, tools or system instructions.
- Existing structured reasoning and intent-interpretation paths, with their own request and validation contracts.
- Deterministic engineering calculations and bounded capability routing, including shaft/pump calculation paths and constraint/units foundations.
- A narrowly scoped cylindrical CAD path using deterministic build123d generation, an isolated remote worker and independent OpenCascade BREP validation.
- Reference/pilot FEA execution using Gmsh and CalculiX, a separate Python numerical worker and a durable execution-worker foundation.
- An isolated Open3D point-cloud inspection/registration prototype. It is not connected to a public scan-upload workflow or production perception path.

This is an engineering platform foundation, not a claim of universal engineering autonomy or certification.

## Chat and engineering task boundaries

The conversational assistant can explain concepts, discuss options, identify missing information and work through ordinary analytic calculations in its response. It does **not** execute CAD, FEA, shell/Python code, project mutations or privileged engineering tools. It cannot mark a result validated, verified or approved.

For registered deterministic operations, use the separate Engineering Core panel. Those workflows retain server-side authorization, typed requests, bounded execution, capability-specific validation and evidence contracts. A successful chat response is not a validated engineering result.

The chat renderer uses assistant-ui, Vercel AI SDK, Streamdown, the Streamdown code plugin, the Streamdown math plugin and KaTeX. A small preprocessing adapter normalizes engineering LaTeX, promotes standalone display equations to proper blocks, preserves fenced code and protects currency values.

## Architecture and trust model

The control plane is the Next.js application and authenticated API. Supabase provides authentication, project/workspace persistence and private storage where configured. The Engineering Core owns typed capability contracts, deterministic providers, task state and validation policy. Long-running or untrusted computation belongs in separately controlled workers.

The model is an assistant, not the engineering authority. It must not invent trusted evidence IDs, provider identity, validation receipts or approval decisions. CAD/solver execution and artifact validation remain separate from conversational generation.

## Technology

| Layer | Current implementation |
|---|---|
| Web application | Next.js 16 App Router, React 19, TypeScript |
| Identity and persistence | Supabase SSR/client integration and project-scoped APIs |
| Conversational UI | assistant-ui |
| Streaming | Vercel AI SDK |
| Chat model provider | Official AI SDK Google/Gemini provider |
| Markdown and mathematics | Streamdown, code/math plugins and KaTeX |
| Unit/integration tests | Vitest |
| Browser acceptance | Playwright |
| CAD reference path | build123d, isolated remote CAD worker and OpenCascade validation |
| FEA reference path | Gmsh and CalculiX worker |
| Physical perception prototype | Open3D worker |

Pinned versions and runnable commands are defined in `package.json` and `package-lock.json`. Environment variable names and safe placeholders are defined in `.env.example`.

## Getting started

Requirements: Node.js `^22.12.0` or `^24.0.0`, npm, and a configured Supabase project for authenticated features.

1. Clone the repository and install the locked dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local`.
3. Configure the Supabase URL and publishable key. Add the server-side model key to enable real streamed chat. Add worker variables only when the matching worker is deployed and ready.
4. Start the application with `npm run dev`.

Useful commands:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local Next.js app |
| `npm test` | Run Vitest |
| `npm run build` | Run the Webpack Next.js production build and TypeScript check |
| `npm run architecture:graph -- --strict` | Enforce the repository dependency-layer rules |
| `npm run test:e2e` | Run Playwright locally after installing its pinned helpers and browser |

Do not put service-role keys, provider secrets, worker bearer tokens or user session cookies in client variables or committed files. The public Supabase publishable key is not a substitute for server-side authorization.

## Verification and deployment

CI runs the repository's unit tests, Python worker tests, architecture checks, CAD/OCCT and FEA worker checks, security scans and production build. The dedicated Playwright workflow uses the protected `e2e-staging` GitHub Environment and disposable non-production accounts. See [the browser acceptance runbook](docs/playwright-e2e.md).

A browser test using a mocked streamed response verifies the UI and renderer; it does not prove live Gemini credentials, model quality, CAD execution or production worker readiness. Verify the exact deployed application and worker revisions before enabling a capability in production.

The intended production web application is hosted on Vercel at [ai-mechanical-engineering-assistant.vercel.app](https://ai-mechanical-engineering-assistant.vercel.app). CAD, FEA and other worker runtimes are separate deployments and must be configured and health-checked independently.

## Documentation

Start with:

- [Product brief](docs/product-brief.md) — current user experience and product scope.
- [Architecture and trust boundaries](docs/architecture.md) — control plane, chat, core, workers and evidence.
- [Engineering capabilities and maturity](docs/engineering-capabilities.md) — implemented, pilot and experimental capabilities.
- [Implementation plan](docs/implementation-plan.md) — current milestone status, next priorities and exit gates.
- [Documentation guide](docs/README.md) — canonical docs and historical records.
- [Model/provider stack](docs/reasoning-model-provider-stack.md) — current chat provider and separate structured-reasoning transport.
- [Playwright runbook](docs/playwright-e2e.md) — safe authenticated browser testing.
- [Worker security](docs/worker-security.md) — isolation and artifact controls.

## Development rules

- Work on a feature branch and use a pull request.
- Preserve the existing architecture and authorization boundaries; do not regenerate the application or add an orchestration framework without an evidenced need.
- Keep secrets server-side and use isolated non-production data for acceptance tests.
- Do not execute generated CAD/solver code inside a Next.js request process.
- Do not report an engineering result as verified unless its capability-specific validator passed and the retained evidence is bound to the exact artifact bytes and source/runtime lineage.
- Mark unavailable, unsupported, unmeasured and untested behavior explicitly.

