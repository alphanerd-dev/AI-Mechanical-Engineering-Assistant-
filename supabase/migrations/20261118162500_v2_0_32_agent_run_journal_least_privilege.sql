-- V2.0.32: enforce the journal's intended server-only least-privilege table ACL.
-- Supabase default privileges may grant broad table rights to service_role.
-- RPCs are SECURITY DEFINER and remain the only path for journal state transitions.
revoke all on table public.engineering_agent_runs from public, anon, authenticated, service_role;
grant select, insert on table public.engineering_agent_runs to service_role;
