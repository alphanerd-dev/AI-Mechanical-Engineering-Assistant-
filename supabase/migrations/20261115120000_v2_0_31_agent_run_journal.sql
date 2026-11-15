-- V2.0.31: dedicated durable journal for bounded model-directed engineering runs.
-- This migration is additive. Do not expose the model-directed API until the persistent
-- worker, exact-host configuration, authenticated E2E and reconciliation procedure pass.
create table public.engineering_agent_runs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.engineering_projects(id) on delete cascade,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  initial_graph_revision bigint not null check (initial_graph_revision > 0),
  current_graph_revision bigint not null check (current_graph_revision > 0),
  status text not null default 'PLANNED' check (status in (
    'PLANNED','RUNNING','WAITING_APPROVAL','COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED'
  )),
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 1048576),
  checkpoint jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoint) = 'object' and pg_column_size(checkpoint) <= 262144),
  action_history jsonb not null default '[]'::jsonb check (jsonb_typeof(action_history) = 'array' and pg_column_size(action_history) <= 4194304),
  next_action_index integer not null default 0 check (next_action_index between 0 and 25),
  current_action jsonb check (current_action is null or (jsonb_typeof(current_action) = 'object' and pg_column_size(current_action) <= 65536)),
  cancel_requested_at timestamptz,
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_agent_runs_idempotency_unique unique(owner_id, project_id, idempotency_key),
  constraint engineering_agent_runs_lease_consistency check (
    (status = 'RUNNING' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or (status <> 'RUNNING' and lease_owner is null and lease_token is null and lease_expires_at is null)
  )
);
create index engineering_agent_runs_project_history_idx
  on public.engineering_agent_runs(project_id, created_at desc);
create index engineering_agent_runs_claim_idx
  on public.engineering_agent_runs(status, lease_expires_at, created_at)
  where status in ('PLANNED','RUNNING');

alter table public.engineering_agent_runs enable row level security;
revoke all on table public.engineering_agent_runs from public, anon, authenticated;
grant select, insert on table public.engineering_agent_runs to service_role;
comment on table public.engineering_agent_runs is
  'Server-only journal for bounded model-directed engineering runs. Model plans are untrusted; action checkpoints and recovery are host-controlled.';
comment on column public.engineering_agent_runs.current_action is
  'Persisted before side effects. An expired lease with a non-null current_action is marked RECONCILIATION_REQUIRED and is never replayed automatically.';
comment on column public.engineering_agent_runs.action_history is
  'Append-only bounded sequence of action identity, digest, outcome and graph revision checkpoints.';

create or replace function public.claim_engineering_agent_run(
  p_run_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 45
)
returns setof public.engineering_agent_runs
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.engineering_agent_runs%rowtype;
begin
  if p_run_id is null then raise exception 'Agent run ID is required.'; end if;
  if p_worker_id is null or length(trim(p_worker_id)) < 1 or length(p_worker_id) > 128 then
    raise exception 'Invalid agent worker identifier.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception 'Invalid agent run lease duration.';
  end if;
  select * into v_run from public.engineering_agent_runs where id = p_run_id for update;
  if not found then return; end if;
  if v_run.status = 'RUNNING' and v_run.lease_expires_at <= clock_timestamp() and v_run.current_action is not null then
    update public.engineering_agent_runs
       set status = 'RECONCILIATION_REQUIRED',
           error = 'Worker lease expired while an action was in flight. Reconcile provider state before resuming.',
           lease_owner = null, lease_token = null, lease_expires_at = null,
           updated_at = clock_timestamp()
     where id = p_run_id;
    return;
  end if;
  if v_run.status = 'RUNNING' and v_run.lease_expires_at > clock_timestamp() then return; end if;
  if v_run.status not in ('PLANNED','RUNNING') then return; end if;
  if v_run.cancel_requested_at is not null and v_run.current_action is null then
    update public.engineering_agent_runs
       set status = 'CANCELLED', finished_at = clock_timestamp(),
           lease_owner = null, lease_token = null, lease_expires_at = null,
           updated_at = clock_timestamp()
     where id = p_run_id;
    return;
  end if;
  if v_run.current_action is not null then
    update public.engineering_agent_runs
       set status = 'RECONCILIATION_REQUIRED',
           error = 'A persisted in-flight action must be reconciled before any retry.',
           lease_owner = null, lease_token = null, lease_expires_at = null,
           updated_at = clock_timestamp()
     where id = p_run_id;
    return;
  end if;
  return query
    update public.engineering_agent_runs
       set status = 'RUNNING',
           lease_owner = p_worker_id,
           lease_token = gen_random_uuid(),
           lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
           started_at = coalesce(started_at, clock_timestamp()),
           updated_at = clock_timestamp()
     where id = p_run_id
     returning *;
end;
$$;
revoke all on function public.claim_engineering_agent_run(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.claim_engineering_agent_run(uuid,text,integer) to service_role;

create or replace function public.renew_engineering_agent_run(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 45
)
returns table(active boolean, cancel_requested boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_run_id is null or p_lease_token is null then raise exception 'Run ID and lease token are required.'; end if;
  if p_worker_id is null or length(trim(p_worker_id)) < 1 or length(p_worker_id) > 128 then
    raise exception 'Invalid agent worker identifier.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception 'Invalid agent run lease duration.';
  end if;
  return query
    update public.engineering_agent_runs as r
       set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
           updated_at = clock_timestamp()
     where r.id = p_run_id and r.status = 'RUNNING'
       and r.lease_owner = p_worker_id and r.lease_token = p_lease_token
       and r.lease_expires_at > clock_timestamp()
     returning true, r.cancel_requested_at is not null;
  if not found then return query select false, false; end if;
end;
$$;
revoke all on function public.renew_engineering_agent_run(uuid,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.renew_engineering_agent_run(uuid,text,uuid,integer) to service_role;

create or replace function public.begin_engineering_agent_action(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_action_index integer,
  p_action_key text,
  p_action_hash text,
  p_action jsonb
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.engineering_agent_runs%rowtype;
  v_existing jsonb;
begin
  if p_run_id is null or p_lease_token is null then
    raise exception 'Run ID and lease token are required.';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) < 1 or length(p_worker_id) > 128 then
    raise exception 'Invalid agent worker identifier.';
  end if;
  if p_action_index is null or p_action_index < 0 or p_action_index >= 25 then
    raise exception 'Invalid agent action index.';
  end if;
  if p_action_key is null or length(trim(p_action_key)) < 8 or length(p_action_key) > 160 then raise exception 'Invalid agent action idempotency key.'; end if;
  if p_action_hash is null or p_action_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid agent action digest.'; end if;
  if p_action is null or jsonb_typeof(p_action) <> 'object' or pg_column_size(p_action) > 32768 then
    raise exception 'Invalid or oversized agent action.';
  end if;
  select * into v_run from public.engineering_agent_runs where id = p_run_id for update;
  if not found then return 'NOT_FOUND'; end if;
  if p_action_index < v_run.next_action_index then
    select entry.value into v_existing from jsonb_array_elements(v_run.action_history) as entry(value)
     where (entry.value->>'actionIndex')::integer = p_action_index limit 1;
    if v_existing is null or v_existing->>'actionHash' <> p_action_hash or v_existing->>'actionKey' <> p_action_key then
      raise exception 'Agent action replay conflicts with the persisted action digest.';
    end if;
    return 'ALREADY_CHECKPOINTED';
  end if;
  if v_run.status <> 'RUNNING' or v_run.lease_owner <> p_worker_id or v_run.lease_token <> p_lease_token
     or v_run.lease_expires_at <= clock_timestamp() or v_run.cancel_requested_at is not null then
    return 'NOT_CLAIMED';
  end if;
  if p_action_index <> v_run.next_action_index then raise exception 'Agent action sequence is out of order.'; end if;
  if v_run.current_action is not null then
    if v_run.current_action->>'actionKey' = p_action_key and v_run.current_action->>'actionHash' = p_action_hash then return 'IN_FLIGHT'; end if;
    raise exception 'A different agent action is already in flight.';
  end if;
  update public.engineering_agent_runs
     set current_action = jsonb_build_object(
       'actionIndex', p_action_index, 'actionKey', p_action_key,
       'actionHash', p_action_hash, 'action', p_action, 'startedAt', clock_timestamp()
     ),
     updated_at = clock_timestamp()
   where id = p_run_id;
  return 'STARTED';
end;
$$;
revoke all on function public.begin_engineering_agent_action(uuid,text,uuid,integer,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.begin_engineering_agent_action(uuid,text,uuid,integer,text,text,jsonb) to service_role;

create or replace function public.checkpoint_engineering_agent_action(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_action_index integer,
  p_action_hash text,
  p_outcome jsonb,
  p_graph_revision bigint,
  p_next_status text default 'RUNNING',
  p_error text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.engineering_agent_runs%rowtype;
  v_existing jsonb;
  v_status text;
begin
  if p_run_id is null or p_lease_token is null then
    raise exception 'Run ID and lease token are required.';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) < 1 or length(p_worker_id) > 128 then
    raise exception 'Invalid agent worker identifier.';
  end if;
  if p_action_index is null or p_action_index < 0 or p_action_index >= 25 then
    raise exception 'Invalid agent action index.';
  end if;
  if p_action_hash is null or p_action_hash !~ '^[0-9a-f]{64}
  if p_outcome is null or jsonb_typeof(p_outcome) <> 'object' or pg_column_size(p_outcome) > 65536 then
    raise exception 'Invalid or oversized agent action outcome.';
  end if;
  if p_error is not null and length(p_error) > 4000 then
    raise exception 'Agent action error detail exceeds the 4000-character limit.';
  end if;
  if p_graph_revision is null or p_graph_revision < 1 then raise exception 'Invalid task graph revision.'; end if;
  if p_next_status is null or p_next_status not in ('RUNNING','WAITING_APPROVAL','COMPLETED','FAILED','CANCELLED') then raise exception 'Invalid next agent run status.'; end if;
  select * into v_run from public.engineering_agent_runs where id = p_run_id for update;
  if not found then return false; end if;
  if p_action_index < v_run.next_action_index then
    select entry.value into v_existing from jsonb_array_elements(v_run.action_history) as entry(value)
     where (entry.value->>'actionIndex')::integer = p_action_index limit 1;
    if v_existing is null or v_existing->>'actionHash' <> p_action_hash then
      raise exception 'Agent checkpoint replay conflicts with the persisted action digest.';
    end if;
    return true;
  end if;
  if v_run.status <> 'RUNNING' or v_run.lease_owner <> p_worker_id or v_run.lease_token <> p_lease_token
     or v_run.lease_expires_at <= clock_timestamp() then return false; end if;
  if v_run.current_action is null or (v_run.current_action->>'actionIndex')::integer <> p_action_index
     or v_run.current_action->>'actionHash' <> p_action_hash then
    raise exception 'Agent checkpoint does not match the persisted in-flight action.';
  end if;
  if p_graph_revision < v_run.current_graph_revision then
    raise exception 'STALE_AGENT_GRAPH: checkpoint revision cannot move the task graph backwards.';
  end if;
  v_status := case
    when v_run.cancel_requested_at is not null then 'CANCELLED'
    else p_next_status
  end;
  update public.engineering_agent_runs
     set action_history = action_history || jsonb_build_array(jsonb_build_object(
       'actionIndex', p_action_index,
       'actionKey', current_action->>'actionKey',
       'actionHash', p_action_hash,
       'action', current_action->'action',
       'outcome', p_outcome,
       'graphRevision', p_graph_revision,
       'completedAt', clock_timestamp()
     )),
     checkpoint = coalesce(p_outcome->'checkpoint', checkpoint),
     current_graph_revision = p_graph_revision,
     current_action = null,
     next_action_index = next_action_index + 1,
     status = v_status,
     error = p_error,
     finished_at = case when v_status in ('COMPLETED','FAILED','CANCELLED') then clock_timestamp() else null end,
     lease_owner = case when v_status = 'RUNNING' then lease_owner else null end,
     lease_token = case when v_status = 'RUNNING' then lease_token else null end,
     lease_expires_at = case when v_status = 'RUNNING' then lease_expires_at else null end,
     updated_at = clock_timestamp()
   where id = p_run_id;
  return true;
end;
$$;
revoke all on function public.checkpoint_engineering_agent_action(uuid,text,uuid,integer,text,jsonb,bigint,text,text) from public, anon, authenticated;
grant execute on function public.checkpoint_engineering_agent_action(uuid,text,uuid,integer,text,jsonb,bigint,text,text) to service_role;

create or replace function public.resume_engineering_agent_run_after_approval(
  p_run_id uuid,
  p_project_id uuid,
  p_approved_by uuid,
  p_approval_evidence_id uuid,
  p_graph_revision bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.engineering_agent_runs%rowtype;
begin
  if p_approved_by is null or p_approval_evidence_id is null then
    raise exception 'Authenticated approver and approval evidence ID are required.';
  end if;
  if not exists (select 1 from auth.users where id = p_approved_by) then
    raise exception 'Approver identity does not exist.';
  end if;

  select * into v_run
    from public.engineering_agent_runs
   where id = p_run_id and project_id = p_project_id
   for update;
  if not found then return false; end if;
  if v_run.status <> 'WAITING_APPROVAL' or v_run.current_action is not null
     or v_run.cancel_requested_at is not null then return false; end if;
  if p_graph_revision is distinct from v_run.current_graph_revision then
    raise exception 'STALE_AGENT_GRAPH: task graph changed while awaiting human approval.';
  end if;

  if not exists (
    select 1
      from public.engineering_audit_events as approval
     where approval.event_id = p_approval_evidence_id
       and approval.project_id = p_project_id
       and approval.resource_type = 'AGENT_RUN'
       and approval.resource_id = p_run_id::text
       and approval.run_id = p_run_id::text
       and approval.action = 'APPROVAL_GRANT'
       and approval.outcome = 'SUCCESS'
       and approval.actor_type = 'USER'
       and approval.actor_subject = p_approved_by::text
       and approval.metadata->>'decision' = 'APPROVED'
       and approval.metadata->>'planHash' = v_run.plan_hash
       and approval.metadata->>'actionIndex' = (v_run.next_action_index - 1)::text
  ) then
    raise exception 'APPROVAL_EVIDENCE_REQUIRED: a durable user approval audit event is required.';
  end if;

  update public.engineering_agent_runs
     set status = 'PLANNED',
         checkpoint = checkpoint || jsonb_build_object(
           'humanApproval', jsonb_build_object(
             'approvedBy', p_approved_by,
             'approvalEvidenceId', p_approval_evidence_id,
             'graphRevision', p_graph_revision,
             'approvedAt', clock_timestamp()
           )
         ),
         error = null,
         finished_at = null,
         updated_at = clock_timestamp()
   where id = p_run_id;
  return true;
end;
$function$;
revoke all on function public.resume_engineering_agent_run_after_approval(uuid,uuid,uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.resume_engineering_agent_run_after_approval(uuid,uuid,uuid,uuid,bigint) to service_role;

create or replace function public.request_engineering_agent_run_cancellation(
  p_run_id uuid,
  p_project_id uuid
)
returns public.engineering_agent_runs
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.engineering_agent_runs%rowtype;
begin
  select * into v_run from public.engineering_agent_runs
   where id = p_run_id and project_id = p_project_id for update;
  if not found then return; end if;
  if v_run.status in ('PLANNED','WAITING_APPROVAL','RUNNING') and v_run.current_action is null then
    update public.engineering_agent_runs
       set status = 'CANCELLED', cancel_requested_at = coalesce(cancel_requested_at, clock_timestamp()),
           finished_at = clock_timestamp(), lease_owner = null, lease_token = null,
           lease_expires_at = null, updated_at = clock_timestamp()
     where id = p_run_id returning * into v_run;
  elsif v_run.status = 'RUNNING' then
    update public.engineering_agent_runs
       set cancel_requested_at = coalesce(cancel_requested_at, clock_timestamp()),
           updated_at = clock_timestamp()
     where id = p_run_id returning * into v_run;
  end if;
  return v_run;
end;
$$;
revoke all on function public.request_engineering_agent_run_cancellation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.request_engineering_agent_run_cancellation(uuid,uuid) to service_role;
 then
    raise exception 'Invalid agent action digest.';
  end if;
  if p_outcome is null or jsonb_typeof(p_outcome) <> 'object' or pg_column_size(p_outcome) > 131072 then raise exception 'Invalid or oversized agent action outcome.'; end if;
  if p_graph_revision is null or p_graph_revision < 1 then raise exception 'Invalid task graph revision.'; end if;
  if p_next_status is null or p_next_status not in ('RUNNING','WAITING_APPROVAL','COMPLETED','FAILED','CANCELLED') then raise exception 'Invalid next agent run status.'; end if;
  select * into v_run from public.engineering_agent_runs where id = p_run_id for update;
  if not found then return false; end if;
  if p_action_index < v_run.next_action_index then
    select entry.value into v_existing from jsonb_array_elements(v_run.action_history) as entry(value)
     where (entry.value->>'actionIndex')::integer = p_action_index limit 1;
    if v_existing is null or v_existing->>'actionHash' <> p_action_hash then
      raise exception 'Agent checkpoint replay conflicts with the persisted action digest.';
    end if;
    return true;
  end if;
  if v_run.status <> 'RUNNING' or v_run.lease_owner <> p_worker_id or v_run.lease_token <> p_lease_token
     or v_run.lease_expires_at <= clock_timestamp() then return false; end if;
  if v_run.current_action is null or (v_run.current_action->>'actionIndex')::integer <> p_action_index
     or v_run.current_action->>'actionHash' <> p_action_hash then
    raise exception 'Agent checkpoint does not match the persisted in-flight action.';
  end if;
  if p_graph_revision < v_run.current_graph_revision then
    raise exception 'STALE_AGENT_GRAPH: checkpoint revision cannot move the task graph backwards.';
  end if;
  v_status := case
    when v_run.cancel_requested_at is not null then 'CANCELLED'
    else p_next_status
  end;
  update public.engineering_agent_runs
     set action_history = action_history || jsonb_build_array(jsonb_build_object(
       'actionIndex', p_action_index,
       'actionKey', current_action->>'actionKey',
       'actionHash', p_action_hash,
       'action', current_action->'action',
       'outcome', p_outcome,
       'graphRevision', p_graph_revision,
       'completedAt', clock_timestamp()
     )),
     checkpoint = coalesce(p_outcome->'checkpoint', checkpoint),
     current_graph_revision = p_graph_revision,
     current_action = null,
     next_action_index = next_action_index + 1,
     status = v_status,
     error = p_error,
     finished_at = case when v_status in ('COMPLETED','FAILED','CANCELLED') then clock_timestamp() else null end,
     lease_owner = case when v_status = 'RUNNING' then lease_owner else null end,
     lease_token = case when v_status = 'RUNNING' then lease_token else null end,
     lease_expires_at = case when v_status = 'RUNNING' then lease_expires_at else null end,
     updated_at = clock_timestamp()
   where id = p_run_id;
  return true;
end;
$$;
revoke all on function public.checkpoint_engineering_agent_action(uuid,text,uuid,integer,text,jsonb,bigint,text,text) from public, anon, authenticated;
grant execute on function public.checkpoint_engineering_agent_action(uuid,text,uuid,integer,text,jsonb,bigint,text,text) to service_role;

create or replace function public.resume_engineering_agent_run_after_approval(
  p_run_id uuid,
  p_project_id uuid,
  p_approved_by uuid,
  p_approval_evidence_id uuid,
  p_graph_revision bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.engineering_agent_runs%rowtype;
begin
  if p_approved_by is null or p_approval_evidence_id is null then
    raise exception 'Authenticated approver and approval evidence ID are required.';
  end if;
  if not exists (select 1 from auth.users where id = p_approved_by) then
    raise exception 'Approver identity does not exist.';
  end if;

  select * into v_run
    from public.engineering_agent_runs
   where id = p_run_id and project_id = p_project_id
   for update;
  if not found then return false; end if;
  if v_run.status <> 'WAITING_APPROVAL' or v_run.current_action is not null
     or v_run.cancel_requested_at is not null then return false; end if;
  if p_graph_revision is distinct from v_run.current_graph_revision then
    raise exception 'STALE_AGENT_GRAPH: task graph changed while awaiting human approval.';
  end if;

  if not exists (
    select 1
      from public.engineering_audit_events as approval
     where approval.event_id = p_approval_evidence_id
       and approval.project_id = p_project_id
       and approval.resource_type = 'AGENT_RUN'
       and approval.resource_id = p_run_id::text
       and approval.run_id = p_run_id::text
       and approval.action = 'APPROVAL_GRANT'
       and approval.outcome = 'SUCCESS'
       and approval.actor_type = 'USER'
       and approval.actor_subject = p_approved_by::text
       and approval.metadata->>'decision' = 'APPROVED'
       and approval.metadata->>'planHash' = v_run.plan_hash
       and approval.metadata->>'actionIndex' = (v_run.next_action_index - 1)::text
  ) then
    raise exception 'APPROVAL_EVIDENCE_REQUIRED: a durable user approval audit event is required.';
  end if;

  update public.engineering_agent_runs
     set status = 'PLANNED',
         checkpoint = checkpoint || jsonb_build_object(
           'humanApproval', jsonb_build_object(
             'approvedBy', p_approved_by,
             'approvalEvidenceId', p_approval_evidence_id,
             'graphRevision', p_graph_revision,
             'approvedAt', clock_timestamp()
           )
         ),
         error = null,
         finished_at = null,
         updated_at = clock_timestamp()
   where id = p_run_id;
  return true;
end;
$function$;
revoke all on function public.resume_engineering_agent_run_after_approval(uuid,uuid,uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.resume_engineering_agent_run_after_approval(uuid,uuid,uuid,uuid,bigint) to service_role;

create or replace function public.request_engineering_agent_run_cancellation(
  p_run_id uuid,
  p_project_id uuid
)
returns public.engineering_agent_runs
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.engineering_agent_runs%rowtype;
begin
  select * into v_run from public.engineering_agent_runs
   where id = p_run_id and project_id = p_project_id for update;
  if not found then return; end if;
  if v_run.status in ('PLANNED','WAITING_APPROVAL','RUNNING') and v_run.current_action is null then
    update public.engineering_agent_runs
       set status = 'CANCELLED', cancel_requested_at = coalesce(cancel_requested_at, clock_timestamp()),
           finished_at = clock_timestamp(), lease_owner = null, lease_token = null,
           lease_expires_at = null, updated_at = clock_timestamp()
     where id = p_run_id returning * into v_run;
  elsif v_run.status = 'RUNNING' then
    update public.engineering_agent_runs
       set cancel_requested_at = coalesce(cancel_requested_at, clock_timestamp()),
           updated_at = clock_timestamp()
     where id = p_run_id returning * into v_run;
  end if;
  return v_run;
end;
$$;
revoke all on function public.request_engineering_agent_run_cancellation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.request_engineering_agent_run_cancellation(uuid,uuid) to service_role;
