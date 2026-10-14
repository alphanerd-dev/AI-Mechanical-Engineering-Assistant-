-- V2.0.24: owner-controlled project lifecycle and atomic project rename.
-- The API enforces ownership and the database independently fails closed.
grant delete on table public.engineering_projects to authenticated;

drop policy if exists engineering_projects_delete_owner on public.engineering_projects;
create policy engineering_projects_delete_owner
  on public.engineering_projects
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.update_engineering_project_name(
  p_project_id uuid,
  p_expected_revision bigint,
  p_name text
)
returns setof public.engineering_projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.engineering_projects%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 120 then
    raise exception 'Project name must contain 2–120 characters.' using errcode = '22023';
  end if;

  select ep.*
    into v_project
    from public.engineering_projects as ep
   where ep.id = p_project_id
   for update;

  if not found then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;

  if v_project.owner_id <> (select auth.uid()) then
    raise exception 'Only the project owner can rename this project.' using errcode = '42501';
  end if;

  if v_project.revision <> p_expected_revision then
    raise exception 'PROJECT_REVISION_CONFLICT' using errcode = '40001';
  end if;

  update public.engineering_projects as ep
     set name = trim(p_name),
         revision = ep.revision + 1,
         updated_at = now()
   where ep.id = p_project_id
   returning ep.* into v_project;

  -- Project and workspace names are a single logical value; update both rows
  -- in the same transaction and advance the workspace's independent revision.
  update public.engineering_workspaces as ew
     set revision = ew.revision + 1,
         snapshot = jsonb_set(
           jsonb_set(
             jsonb_set(ew.snapshot, '{name}', to_jsonb(v_project.name), true),
             '{project,name}', to_jsonb(v_project.name), true
           ),
           '{revision}', to_jsonb(ew.revision + 1), true
         ),
         saved_at = now()
   where ew.project_id = p_project_id;

  if not found then
    raise exception 'The project workspace is not initialized; rename was rolled back.' using errcode = 'P0002';
  end if;

  return next v_project;
end;
$$;

revoke all on function public.update_engineering_project_name(uuid, bigint, text) from public, anon;
grant execute on function public.update_engineering_project_name(uuid, bigint, text) to authenticated;

notify pgrst, 'reload schema';
