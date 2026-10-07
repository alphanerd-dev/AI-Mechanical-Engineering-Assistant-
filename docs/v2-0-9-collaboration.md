# V2.0.9 — Collaborative Engineering State & Project Isolation

V2.0.9 establishes the durable multi-user foundation without turning the product into a social collaboration platform.

## Scope
- Durable engineering projects
- Project memberships with ENGINEER, REVIEWER, ADMIN, and AGENT roles
- Durable workspace snapshots
- Optimistic workspace revision control
- Database-enforced project isolation through Supabase Row Level Security
- Provider-neutral collaboration contracts in the Engineering Core

## Deliberately deferred
- Realtime presence
- Chat/comments/activity feeds
- Social collaboration features
- Realtime editing semantics
- Full durable task/artifact/evidence/audit stores

Those capabilities are added only when they directly improve completion of real engineering workflows.

## Security boundary
Supabase Auth identifies the caller. Project membership is the database authorization source for project-scoped data. RLS is the final data boundary; application authorization is not treated as a substitute for database isolation.

Authorization data must not come from user-editable user_metadata. Membership is represented by database rows and protected by RLS.

## Concurrency
Workspace writes use a monotonically increasing revision. A stale expected revision is rejected rather than silently overwriting another engineer's changes.

## Product principle
Collaboration exists to preserve shared engineering state and ownership. It is not a separate social product.
