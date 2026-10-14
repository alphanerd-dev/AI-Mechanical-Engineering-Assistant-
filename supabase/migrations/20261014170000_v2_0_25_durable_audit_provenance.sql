-- V2.0.25: server-controlled append-only audit and evidence provenance events.
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
