# V2.2 — Persistent Engineering Workspace

## Delivered in this slice

- A project board lists projects visible to the signed-in user through Supabase row-level security (RLS).
- Project creation is authorized by the trusted engineering role, stores the authenticated user as owner, and relies on the database owner-membership trigger rather than client-supplied identity.
- Every registered project receives a versioned workspace snapshot in `engineering_workspaces`; if the initial insert was interrupted, the workspace API can initialize the missing snapshot without overwriting a concurrent first write.
- Requirements, assumptions, open questions, calculation events, and requirement-completeness checks are persisted in the project snapshot.
- Workspace writes use optimistic concurrency against the database row revision. Stale writes return HTTP 409 rather than silently overwriting another contributor's changes.
- New client-supplied requirements are always normalized to `OPEN`. They cannot set themselves to `SATISFIED` by editing JSON; satisfaction must be backed by a trusted validation/evidence workflow.
- Shaft torque is calculated server-side using SI unit conversion: `T = P / omega`, `omega = 2*pi*n/60`. Results are recorded as `CALCULATED`, not `VERIFIED` or design-approved.
- Validation views read real project events, CAD completion records, and the existing CAD runtime readiness endpoint. The `demo` route is retained only as a clearly labelled sandbox.

## API surface

- `GET /api/projects` — list projects the authenticated user may read.
- `POST /api/projects` — create a project with a bounded name and optional problem statement.
- `GET /api/projects/:projectId/workspace` — load a registered project's durable snapshot.
- `PATCH /api/projects/:projectId/workspace` — update requirement/context collections, run the deterministic shaft torque calculation, or record a requirement-completeness check. Every mutation supplies `expectedRevision`.

Every API first checks the authenticated engineering identity and required project permission. Database operations run through the user's Supabase session so database RLS and project membership remain active. The server never trusts a user-supplied owner ID or project role.

## Deployment boundary and remaining prerequisites

The CAD provider and independent OCCT validation code already exist. In production, CAD is deliberately disabled unless the readiness endpoint confirms the trusted worker images, immutable image digests, artifact root, Docker daemon, service-role database writer, CAD tables, validator script and private artifact bucket are available.

The current deployment uses Vercel serverless functions; the existing CAD implementation expects a reachable Docker daemon and host-mounted artifact directory. Those prerequisites are not supplied by an ordinary Vercel function. Therefore this slice does **not** claim production CAD execution is ready. Provision a separate trusted container worker (or another supported isolated execution host) and adapt the application to call it through an authenticated, bounded job API before enabling production CAD. Keep the service-role key server-only.

Do not resolve role failures by trusting `user_metadata`, removing authorization checks, or making project/artifact tables public. The account must carry an approved value in trusted Supabase App Metadata, and project-level operations must still pass the database membership policies.

## Verification expectations

The feature adds Vitest coverage for input bounds, duplicate requirement IDs, torque unit conversion, and the rule that a completeness check cannot pass without defined MUST requirements and evidence. CI must also complete the repository's existing worker, CAD, FEA and Next.js build suites before merge.
