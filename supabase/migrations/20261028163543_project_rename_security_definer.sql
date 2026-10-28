-- Project rename is a single logical project/workspace mutation. Authenticated
-- callers may read workspace snapshots but must not write arbitrary JSON directly.
-- The RPC must therefore run with its owner's privileges while retaining explicit
-- auth.uid() ownership, project-name validation, and optimistic-revision checks.
begin;
alter function public.update_engineering_project_name(uuid, bigint, text) security definer;
alter function public.update_engineering_project_name(uuid, bigint, text) set search_path = '';
revoke all on function public.update_engineering_project_name(uuid, bigint, text) from public, anon;
grant execute on function public.update_engineering_project_name(uuid, bigint, text) to authenticated;
comment on function public.update_engineering_project_name(uuid, bigint, text) is
  'Owner-verified atomic project/workspace rename. SECURITY DEFINER is required because authenticated clients cannot write engineering_workspaces directly; auth.uid() ownership and revision checks remain mandatory.';
notify pgrst, 'reload schema';
commit;
