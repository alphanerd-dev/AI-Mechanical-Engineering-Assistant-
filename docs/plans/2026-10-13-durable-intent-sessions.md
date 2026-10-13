# Implementation Plan — Durable Engineering Intent Sessions

**Status:** Next focused implementation slice after the architecture graph PR.  
**Goal:** Make multi-turn engineering intent continuation survive serverless instance changes without weakening project authorization or treating stored interpretations as engineering truth.

## Design constraints

- Preserve the `EngineeringIntentSessionStore` abstraction and in-memory adapter for deterministic unit tests.
- Make persistence operations asynchronous; database calls must not be hidden behind synchronous-looking APIs.
- Scope every row by `project_id + session_id`; a session ID alone is never an authorization key.
- Keep the store behind the server-side route. Do not expose a service-role key to browser code.
- Use the caller's authenticated Supabase client and database RLS policies for project-scoped reads/writes. Require the trusted engineering role and project membership before invoking the capability router.
- If the database is unavailable, return a controlled failure. Do not silently fall back to an instance-local store in production.
- Session interpretations only provide conversational context. Deterministic providers, validation, authorization, approvals, and evidence remain authoritative.
- Session lifetime follows the owning project; project deletion cascades. Do not introduce a separate retention period without a product/data-retention decision.

## Implementation tasks

### 1. Database migration

- Add `engineering_intent_sessions` with a foreign key to `engineering_projects`, bounded `session_id`, JSONB interpretation object, and server-managed `updated_at`.
- Add a primary key on `(project_id, session_id)` and an index suitable for project-scoped lookup.
- Enable RLS and grant only the required operations to authenticated users.
- Permit reads only to project members and writes only to project roles allowed to execute engineering work (`ADMIN` / `ENGINEER`), using existing private membership/role helpers.
- Keep `anon` access denied. Do not trust client-supplied owner IDs or roles.

### 2. Async store contract and adapter

- Change `get`, `save`, and `delete` to return promises.
- Update `InMemoryEngineeringIntentSessionStore` to implement the async contract and preserve defensive copying.
- Add a Supabase-backed adapter using the request-scoped, authenticated Supabase client.
- Use atomic upsert semantics for `(project_id, session_id)`; validate retrieved JSON before using it.
- Keep database errors generic at the API boundary and avoid logging raw user intent or credentials.

### 3. Route and provider integration

- Authorize `TASK.EXECUTE` and verify project membership before constructing the persistent store or running the capability router.
- Create the store per request; do not keep a database client or session cache in a module-global variable.
- Await session reads/writes in `AIEngineeringIntentProvider`.
- Return a controlled 503 when persistence is unavailable; do not claim continuation succeeded if the save failed.
- Preserve existing fail-closed validation and the rule that a session is not an authorization or verification source.

### 4. Regression tests

- Store round-trip, overwrite/upsert, delete, and defensive-copy behavior.
- Two independent store instances can read the same session after a simulated instance change.
- The same `session_id` in different projects never collides.
- Invalid or malformed stored JSON is rejected safely.
- RLS denies anonymous access and denies users without membership or an execution-capable project role.
- Authorization denial occurs before session reads/writes and capability execution.
- Persistence failure returns a controlled error and never claims a successful continuation.
- Existing seven V2.0.15 intent acceptance cases remain green.

### 5. Rollout and verification

1. Apply the migration to the intended Supabase project before deploying code that requires the table.
2. Run focused store/provider/route tests, then `npm test`, `npm run build`, ESLint, CodeQL, and Codacy.
3. Verify the Vercel preview build is ready and the Render test app still starts.
4. With two isolated authenticated test users, verify continuation persists across requests and cross-project reads/writes are denied.
5. Confirm a missing table or database outage produces a controlled 503 and does not fall back to in-memory state.
6. Merge only after checks pass; monitor deployments and record the exact commit and live test evidence.

## Acceptance criteria

- Multi-turn continuation survives separate request/store instances.
- No cross-project session access or collisions.
- Authorization remains database-backed and fail-closed.
- A persistence outage is visible and does not silently degrade to volatile state.
- Existing deterministic calculation, validation, approval, and evidence contracts are unchanged.
