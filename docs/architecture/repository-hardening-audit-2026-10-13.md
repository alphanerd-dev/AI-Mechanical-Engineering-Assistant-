# Repository Architecture and Stack Audit — 2026-10-13

## Scope and evidence

Reviewed the repository at main commit `cae4cb2c19167b077bd697b03287bcb2b936e1bc`, architecture/workspace documentation, authorization and session code, Supabase migrations, package manifest, CI workflows, and connected deployment metadata.

This is a static review plus CI/deployment metadata review. It is not a penetration test and does not establish authenticated cross-user isolation or production CAD readiness.

The Engineering Core CI workflow now generates an `architecture-dependency-graph` artifact on each run. It records local import edges, external import references, unresolved relative imports, and strongly connected dependency cycles. The scanner covers production TypeScript/JavaScript under `app/`, `components/`, `lib/`, and `src/`; it excludes tests/specs and does not attempt to graph Python/CAD worker runtimes or SQL migrations. Exact counts live in each CI artifact so this document does not become stale.

## Existing stack — keep it

| Area | Current implementation | Recommendation |
|---|---|---|
| Web application | Next.js 16, React 19, TypeScript 5 | Keep |
| Authentication and database | Supabase SSR/client, PostgreSQL, RLS | Keep; enforce membership in application and database layers |
| Runtime validation | Ajv / JSON Schema | Keep; do not add a second schema framework without a specific gap |
| Tests | Vitest, TypeScript checks, Python worker tests, Docker smoke/acceptance tests | Keep; add browser E2E coverage |
| Engineering computation | Python, Pint, SymPy, NumPy, SciPy | Keep |
| CAD/FEA | Isolated build123d/OpenCascade and CalculiX worker images; authenticated remote CAD worker contract | Keep; verify the deployed app-to-worker path with authenticated readiness checks |
| Delivery/security | GitHub Actions, ESLint, CodeQL, Codacy, Vercel, Render | Keep; add durable runtime evidence and browser-level acceptance tests |

No dependency was added for the graph analyzer. It uses the existing TypeScript compiler API and `tsx` runner.

## Ranked findings

### P1 — Multi-turn intent state is not durable

**Evidence:** `app/api/engineering/intent/route.ts` creates a module-level `InMemoryEngineeringIntentSessionStore`; `src/intent/session.ts` stores sessions in a JavaScript `Map`. The V2.0.15 design note explicitly lists durable session persistence as a non-goal.

**Impact:** A continuation can lose prior extracted inputs when a serverless instance is recycled or the next request reaches another instance. Process memory is not a reliable cross-request persistence layer in serverless deployments. It also makes deployed behavior differ from local tests.

**Action:** Implement an asynchronous, project-scoped Supabase store with a migration, RLS policies, and regression tests across separate store instances. Do not silently fall back to in-memory state in production; fail closed with a controlled service error when durable storage is unavailable.

### P1 — Authentication audit history is process-local

**Evidence:** `src/auth/supabase-service.ts` stores an `InMemoryAuditTrail` on `globalThis`; `src/audit/trail.ts` keeps events in an in-memory array. Its hash chain can detect edits within that process-local sequence, but it does not provide durable history across instances or deployments.

**Impact:** Authorization diagnostics are not a durable security audit record and cannot be treated as long-lived evidence after a process restart.

**Action:** Design a separate append-only database audit store with server-only writes, explicit project association, access controls, and a concurrency-safe integrity strategy. Do not describe the existing in-memory hash chain as a durable audit ledger.

### P1 — Automated browser-level auth and tenant-isolation acceptance is missing

**Evidence:** The repository has substantial Vitest coverage, including mocked route authorization tests, but no direct Playwright dependency or browser E2E workflow was found in the reviewed package/configuration.

**Impact:** Unit tests prove isolated policy branches, not the complete browser-cookie-API-RLS path for two real authenticated users.

**Action:** Add a browser acceptance suite using isolated test identities and a non-production Supabase environment. Cover sign-up/confirmation, sign-in, sign-out, project creation and refresh persistence, user A versus user B project access, direct API access, and unauthenticated requests. Never use production user credentials as CI secrets.

### P1 — Production CAD readiness still needs authenticated runtime proof

**Evidence:** Render has a live `ai-mechanical-cad-worker` service on branch `test-deployment`, while the production web app is deployed from `main`. The CAD readiness route requires an authenticated user and registered project UUID, then checks worker reachability, artifact-root access, database tables, and private artifact storage. CI exercises worker images and CAD/OCCT/FEA paths locally in isolated containers.

**Impact:** A live worker service and green local Docker tests do not prove the production Vercel environment is correctly configured to call that worker or persist artifacts.

**Action:** Run the readiness endpoint with an authorized production test identity and record each check. Verify a bounded CAD job reaches the deployed worker, returns artifacts, persists a manifest, and passes independent validation before calling production CAD ready.

### P2 — Architecture boundaries are documented more strongly than they are enforced

**Evidence:** `docs/nextjs-workspace.md` defines a thin app layer, deterministic TypeScript core, providers, and isolated workers. The baseline source graph identified two dependency cycles: the reasoning-framework barrel/type-import cycle and the verification engine/plans/project cycle. This PR removes both and adds a strict CI gate for cycles and unresolved relative imports.

**Action:** Add explicit layer-boundary rules only after reviewing actual dependencies. The graph gate does not yet enforce all intended rules (for example, that core modules must not import web/UI adapters), so that remains follow-up work.

### P2 — Runtime observability is not yet a durable end-to-end evidence chain

**Evidence:** The auth layer emits structured diagnostic events and Vercel exposes runtime error groups, but there is no demonstrated durable correlation chain spanning request, capability, worker job, artifact manifest, validation result, and audit event.

**Action:** Add correlation IDs and persistent job/evidence references as part of worker and audit hardening. Avoid adding a large observability stack before correlation and retention contracts are defined.

## Dependency decisions

- **Do not add LangGraph/CrewAI now.** A bridge contract exists, but the deterministic capability router remains the execution authority. Revisit workflow frameworks only when durable checkpoints, resumable orchestration, and human approval state require them.
- **Do not add Zod alongside Ajv by default.** Keep JSON Schema validation unless a concrete developer-experience gap justifies a second validator.
- **Do not add an ORM or Kubernetes for this hardening slice.** Neither solves the confirmed session persistence issue by itself.
- **Evaluate Playwright next** because the missing coverage is browser-level behavior, not more unit-test infrastructure.
- Keep the stack change-minimal. The highest-value work is durable state, authorization acceptance, and production evidence—not library count.

## Commands and delivery boundary

- `npm run architecture:graph` prints a concise graph/cycle/unresolved-import report.
- `npm run architecture:graph:json` emits the complete graph as JSON.
- `npm run architecture:graph -- --strict` exits non-zero if cycles or unresolved relative imports exist.
- CI uploads a JSON artifact named `architecture-dependency-graph` with 14-day retention.

The findings above are confirmed from code/configuration unless explicitly labelled as needing runtime proof. Authenticated cross-user API testing remains unverified by this static audit.
