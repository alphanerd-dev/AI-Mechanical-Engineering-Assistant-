-- Bind new project ownership to the same verified database identity used by RLS.
-- This prevents application-supplied owner IDs from diverging from auth.uid().
alter table public.engineering_projects
  alter column owner_id set default auth.uid();
