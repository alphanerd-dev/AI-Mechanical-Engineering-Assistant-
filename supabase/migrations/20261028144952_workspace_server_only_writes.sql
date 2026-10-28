-- Workspace snapshots contain calculation artifacts, validation receipts and audit-linked state.
-- Authenticated clients may read snapshots subject to project membership RLS, but may not
-- write arbitrary JSON that could bypass application validators and forge engineering evidence.
-- Authorized Next.js routes use a server-only service-role client only after validating the
-- caller's current identity, project membership and requested operation.

revoke insert, update, delete on table public.engineering_workspaces from anon, authenticated;
grant select on table public.engineering_workspaces to authenticated;

comment on table public.engineering_workspaces is
  'Revisioned project state. Mutations must pass through authenticated server routes so domain validation and audit checks cannot be bypassed by direct Data API writes.';
