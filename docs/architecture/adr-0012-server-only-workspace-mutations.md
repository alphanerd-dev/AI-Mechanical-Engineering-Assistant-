# ADR-0012: Server-only mutations for engineering workspace snapshots

- Status: Proposed for review; feature branch implementation uses this boundary
- Date: 2026-10-28
- Scope: Existing Supabase-backed engineering workspaces

## Context

A workspace snapshot contains user-authored requirements and assumptions plus generated calculation outputs, artifact lineage, validation receipts and event references. If ordinary authenticated clients can update the JSON document directly, they can bypass server-side input validation and can forge or remove fields that the application presents as calculation evidence. Row-level authorization by project membership is necessary, but membership alone does not make the payload trustworthy.

## Decision

Keep Supabase as the identity, database and row-level authorization system. Project-scoped workspace APIs must authenticate the caller, verify current project membership and requested permission, validate the requested operation, validate the resulting snapshot, and apply a revision-guarded update. After application authorization succeeds, these routes use the server-only service-role client for workspace IO. The service-role key remains server-side and must never be exposed to browser code.

Authenticated clients retain read-only access to workspace rows through the existing membership RLS policy. A database migration revokes direct INSERT/UPDATE/DELETE privileges from anon and authenticated roles. This does not replace project authorization: server-side routes still fail closed when identity, membership, durable authorization audit, or privileged server configuration is unavailable.

## Consequences

- Direct Data API writes can no longer bypass the engineering domain validation contract.
- Existing workspace optimistic concurrency checks remain the application-level conflict gate.
- Workspace artifacts and receipts are protected from direct authenticated-table tampering, but they are still embedded in a revisioned JSON snapshot rather than a separately append-only artifact/evidence table.
- Any future workspace writer must use an authorized server-side service and preserve revision, provenance, audit and validation semantics.
- The migration must be applied to each intended environment by its controlled migration workflow. Applying it to a test environment does not prove production has the migration.

## Security invariants

1. Authentication and current project membership are checked before privileged workspace access.
2. Service-role credentials exist only in server-only code and environment configuration.
3. RLS continues to restrict direct authenticated SELECT by project membership.
4. Direct authenticated INSERT/UPDATE/DELETE against engineering_workspaces is denied.
5. A successful calculation run is not the same as engineering verification or human approval.
