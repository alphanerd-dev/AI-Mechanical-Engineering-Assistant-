-- Issue #79: bring production Supabase schema in line with the isolated E2E
-- acceptance schema. Additive/idempotent; does not copy E2E data or run Playwright
-- against production. Keep the E2E project exclusively for browser testing.

alter table public.engineering_intent_sessions
  add column if not exists schema_version integer not null default 1,
  add column if not exists conversation jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_revision integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_intent_sessions'::regclass
      and conname = 'engineering_intent_sessions_schema_version_check'
  ) then
    alter table public.engineering_intent_sessions
      add constraint engineering_intent_sessions_schema_version_check
      check (schema_version >= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_intent_sessions'::regclass
      and conname = 'engineering_intent_sessions_conversation_check'
  ) then
    alter table public.engineering_intent_sessions
      add constraint engineering_intent_sessions_conversation_check
      check (jsonb_typeof(conversation) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_intent_sessions'::regclass
      and conname = 'engineering_intent_sessions_snapshot_revision_check'
  ) then
    alter table public.engineering_intent_sessions
      add constraint engineering_intent_sessions_snapshot_revision_check
      check (snapshot_revision >= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_intent_sessions'::regclass
      and conname = 'engineering_intent_sessions_session_id_check'
  ) then
    alter table public.engineering_intent_sessions
      add constraint engineering_intent_sessions_session_id_check
      check (length(trim(session_id)) between 1 and 128);
  end if;
end $$;

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
set search_path = ''
as $function$
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
$function$;

revoke all on function public.update_engineering_project_name(uuid, bigint, text) from public, anon;
grant execute on function public.update_engineering_project_name(uuid, bigint, text) to authenticated;

create table if not exists public.engineering_audit_events (
  event_id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  actor_subject text not null check (length(trim(actor_subject)) > 0),
  actor_type text not null check (actor_type in ('USER','AGENT','SYSTEM')),
  actor_roles text[] not null default '{}'::text[],
  action text not null check (action in (
    'AUTHENTICATION','AUTHORIZATION','PROJECT_READ','PROJECT_WRITE','TASK_PROPOSE',
    'TASK_EXECUTE','TASK_DELEGATE','APPROVAL_REQUEST','APPROVAL_GRANT','EVIDENCE_READ',
    'EVIDENCE_WRITE','IDENTITY_ADMIN','SYSTEM_EVENT'
  )),
  outcome text not null check (outcome in ('ALLOWED','DENIED','SUCCESS','FAILURE','BLOCKED','PENDING')),
  project_id text,
  resource_type text,
  resource_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id text,
  task_id text,
  run_id text,
  provider_id text,
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[a-f0-9]{64}$'),
  validator_receipt_id text,
  decision_id text,
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  persisted_at timestamptz not null default now()
);

create index if not exists engineering_audit_events_project_time_idx
  on public.engineering_audit_events(project_id, occurred_at desc);
create index if not exists engineering_audit_events_request_id_idx
  on public.engineering_audit_events(request_id) where request_id is not null;
create index if not exists engineering_audit_events_task_run_idx
  on public.engineering_audit_events(task_id, run_id) where task_id is not null or run_id is not null;
create index if not exists engineering_audit_events_provider_idx
  on public.engineering_audit_events(provider_id, occurred_at desc) where provider_id is not null;

alter table public.engineering_audit_events enable row level security;
revoke all on table public.engineering_audit_events from public, anon, authenticated, service_role;
grant select, insert on table public.engineering_audit_events to service_role;
