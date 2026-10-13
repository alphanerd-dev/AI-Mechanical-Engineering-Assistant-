-- V2.0.22: durable, project-scoped engineering intent continuation.
create table public.engineering_intent_sessions (
  project_id uuid not null references public.engineering_projects(id) on delete cascade,
  session_id text not null check (length(trim(session_id)) between 1 and 128),
  interpretation jsonb not null check (jsonb_typeof(interpretation) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (project_id, session_id)
);

create index engineering_intent_sessions_project_updated_idx
  on public.engineering_intent_sessions(project_id, updated_at desc);

alter table public.engineering_intent_sessions enable row level security;
revoke all on table public.engineering_intent_sessions from anon, authenticated;
grant select, insert, update, delete on table public.engineering_intent_sessions to authenticated;

create policy engineering_intent_sessions_select_member
  on public.engineering_intent_sessions
  for select to authenticated
  using ((select private.is_project_member(project_id)));

create policy engineering_intent_sessions_insert_engineer
  on public.engineering_intent_sessions
  for insert to authenticated
  with check (
    (select private.has_project_role(
      project_id,
      array['ADMIN','ENGINEER']::public.engineering_project_role[]
    ))
  );

create policy engineering_intent_sessions_update_engineer
  on public.engineering_intent_sessions
  for update to authenticated
  using (
    (select private.has_project_role(
      project_id,
      array['ADMIN','ENGINEER']::public.engineering_project_role[]
    ))
  )
  with check (
    (select private.has_project_role(
      project_id,
      array['ADMIN','ENGINEER']::public.engineering_project_role[]
    ))
  );

create policy engineering_intent_sessions_delete_engineer
  on public.engineering_intent_sessions
  for delete to authenticated
  using (
    (select private.has_project_role(
      project_id,
      array['ADMIN','ENGINEER']::public.engineering_project_role[]
    ))
  );
