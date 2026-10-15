-- V2.0.26: durable audit chain, verification, and atomic CAD-completion provenance.
-- Keep destructive project lifecycle operations behind the server cleanup route.
revoke delete on table public.engineering_projects from public, anon, authenticated;
drop policy if exists engineering_projects_delete_owner on public.engineering_projects;
-- The owner-checked API uses service_role only after storage cleanup and verification.
grant delete on table public.engineering_projects to service_role;
-- Append-only application writes must go through these SECURITY DEFINER functions.
-- Existing V2.0.25 events are backfilled in a deterministic order before enforcement.

create extension if not exists pgcrypto with schema extensions;

alter table public.engineering_audit_events
  add column if not exists chain_sequence bigint,
  add column if not exists previous_chain_hash text,
  add column if not exists chain_hash text;

do $$
begin
  if exists (
    select 1 from public.engineering_audit_events
    where chain_sequence is null or chain_hash is null
  ) then
    with recursive ordered as (
      select e.event_id, e.event_hash,
             row_number() over (order by e.persisted_at, e.event_id) as seq
        from public.engineering_audit_events e
    ),
    chain as (
      select o.event_id, o.event_hash, o.seq,
             null::text as previous_chain_hash,
             encode(extensions.digest(convert_to(':' || o.event_hash, 'UTF8'), 'sha256'), 'hex') as chain_hash
        from ordered o
       where o.seq = 1
      union all
      select o.event_id, o.event_hash, o.seq,
             c.chain_hash,
             encode(extensions.digest(convert_to(c.chain_hash || ':' || o.event_hash, 'UTF8'), 'sha256'), 'hex')
        from ordered o
        join chain c on o.seq = c.seq + 1
    )
    update public.engineering_audit_events e
       set chain_sequence = c.seq,
           previous_chain_hash = c.previous_chain_hash,
           chain_hash = c.chain_hash
      from chain c
     where c.event_id = e.event_id;
  end if;
end $$;

alter table public.engineering_audit_events
  alter column chain_sequence set not null,
  alter column chain_hash set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.engineering_audit_events'::regclass
       and conname = 'engineering_audit_events_chain_sequence_check'
  ) then
    alter table public.engineering_audit_events
      add constraint engineering_audit_events_chain_sequence_check check (chain_sequence > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.engineering_audit_events'::regclass
       and conname = 'engineering_audit_events_chain_hash_check'
  ) then
    alter table public.engineering_audit_events
      add constraint engineering_audit_events_chain_hash_check check (chain_hash ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.engineering_audit_events'::regclass
       and conname = 'engineering_audit_events_previous_chain_hash_check'
  ) then
    alter table public.engineering_audit_events
      add constraint engineering_audit_events_previous_chain_hash_check
      check (previous_chain_hash is null or previous_chain_hash ~ '^[a-f0-9]{64}$');
  end if;
end $$;

create unique index if not exists engineering_audit_events_chain_sequence_uidx
  on public.engineering_audit_events(chain_sequence);

create table if not exists public.engineering_audit_chain_head (
  chain_name text primary key check (chain_name = 'GLOBAL'),
  last_sequence bigint not null check (last_sequence >= 0),
  last_chain_hash text check (last_chain_hash is null or last_chain_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);
insert into public.engineering_audit_chain_head(chain_name, last_sequence, last_chain_hash)
select 'GLOBAL', coalesce(max(chain_sequence), 0),
       (select e.chain_hash from public.engineering_audit_events e order by e.chain_sequence desc limit 1)
  from public.engineering_audit_events
on conflict (chain_name) do update
set last_sequence = excluded.last_sequence,
    last_chain_hash = excluded.last_chain_hash,
    updated_at = now();

alter table public.engineering_audit_chain_head enable row level security;
revoke all on table public.engineering_audit_chain_head from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger on table public.engineering_audit_events from public, anon, authenticated, service_role;
grant select on table public.engineering_audit_events to service_role;

create or replace function public.append_engineering_audit_event(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_head public.engineering_audit_chain_head%rowtype;
  v_event_id uuid;
  v_event_hash text;
  v_previous_chain_hash text;
  v_chain_hash text;
  v_sequence bigint;
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'Audit record must be a JSON object.' using errcode = '22023';
  end if;

  v_event_id := (p_record->>'event_id')::uuid;
  v_event_hash := p_record->>'event_hash';
  if v_event_hash is null or v_event_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Audit content hash is malformed.' using errcode = '22023';
  end if;

  select * into v_head
    from public.engineering_audit_chain_head
   where chain_name = 'GLOBAL'
   for update;
  if not found then
    raise exception 'Audit chain head is not initialized.' using errcode = '55000';
  end if;

  v_sequence := v_head.last_sequence + 1;
  v_previous_chain_hash := v_head.last_chain_hash;
  v_chain_hash := encode(
    extensions.digest(
      convert_to(coalesce(v_previous_chain_hash, '') || ':' || v_event_hash, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.engineering_audit_events (
    event_id, occurred_at, actor_subject, actor_type, actor_roles, action, outcome,
    project_id, resource_type, resource_id, reason, metadata, request_id, task_id,
    run_id, provider_id, artifact_sha256, validator_receipt_id, decision_id, event_hash,
    chain_sequence, previous_chain_hash, chain_hash
  ) values (
    v_event_id,
    (p_record->>'occurred_at')::timestamptz,
    p_record->>'actor_subject',
    p_record->>'actor_type',
    array(select jsonb_array_elements_text(coalesce(p_record->'actor_roles', '[]'::jsonb))),
    p_record->>'action',
    p_record->>'outcome',
    p_record->>'project_id',
    p_record->>'resource_type',
    p_record->>'resource_id',
    p_record->>'reason',
    coalesce(p_record->'metadata', '{}'::jsonb),
    p_record->>'request_id',
    p_record->>'task_id',
    p_record->>'run_id',
    p_record->>'provider_id',
    p_record->>'artifact_sha256',
    p_record->>'validator_receipt_id',
    p_record->>'decision_id',
    v_event_hash,
    v_sequence,
    v_previous_chain_hash,
    v_chain_hash
  );

  update public.engineering_audit_chain_head
     set last_sequence = v_sequence, last_chain_hash = v_chain_hash, updated_at = now()
   where chain_name = 'GLOBAL';

  return jsonb_build_object(
    'event_id', v_event_id,
    'event_hash', v_event_hash,
    'chain_sequence', v_sequence,
    'previous_chain_hash', v_previous_chain_hash,
    'chain_hash', v_chain_hash
  );
end;
$function$;

create or replace function public.verify_engineering_audit_chain()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_expected_sequence bigint := 1;
  v_previous_hash text := null;
  v_expected_hash text;
  v_count bigint := 0;
begin
  for v_row in
    select chain_sequence, event_hash, previous_chain_hash, chain_hash
      from public.engineering_audit_events
     order by chain_sequence
  loop
    v_count := v_count + 1;
    v_expected_hash := encode(
      extensions.digest(
        convert_to(coalesce(v_previous_hash, '') || ':' || v_row.event_hash, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    if v_row.chain_sequence <> v_expected_sequence
       or v_row.previous_chain_hash is distinct from v_previous_hash
       or v_row.chain_hash is distinct from v_expected_hash then
      return jsonb_build_object(
        'verified', false,
        'checkedEvents', v_count,
        'failedSequence', v_row.chain_sequence,
        'reason', 'AUDIT_CHAIN_INTEGRITY_FAILURE'
      );
    end if;

    v_previous_hash := v_row.chain_hash;
    v_expected_sequence := v_expected_sequence + 1;
  end loop;

  return jsonb_build_object(
    'verified', true,
    'checkedEvents', v_count,
    'lastSequence', v_expected_sequence - 1,
    'lastChainHash', v_previous_hash
  );
end;
$function$;

-- Insert a completion and its durable audit event in one database transaction.
-- If either insert fails, PostgreSQL rolls back both. No browser role can invoke it.
create or replace function public.record_cad_completion_with_audit(
  p_completion jsonb,
  p_audit_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_completion public.engineering_cad_completions%rowtype;
  v_audit_receipt jsonb;
  v_id uuid;
begin
  if jsonb_typeof(p_completion) <> 'object' or jsonb_typeof(p_audit_record) <> 'object' then
    raise exception 'Completion and audit payloads must be JSON objects.' using errcode = '22023';
  end if;

  v_id := (p_completion->>'id')::uuid;
  if (p_audit_record->>'resource_id') is distinct from v_id::text
     or (p_audit_record->>'project_id') is distinct from (p_completion->>'project_id') then
    raise exception 'Completion and audit correlation does not match.' using errcode = '22023';
  end if;

  insert into public.engineering_cad_completions (
    id, project_id, model_identity_id, execution_id, status, stage, raw_intent,
    intent_resolution, specification, source_sha256, artifact_records, engineering_artifacts,
    evidence_records, validation_receipt, storage_objects, errors, warnings, created_by
  ) values (
    v_id,
    (p_completion->>'project_id')::uuid,
    nullif(p_completion->>'model_identity_id', '')::uuid,
    p_completion->>'execution_id',
    p_completion->>'status',
    p_completion->>'stage',
    p_completion->>'raw_intent',
    p_completion->'intent_resolution',
    p_completion->'specification',
    p_completion->>'source_sha256',
    coalesce(p_completion->'artifact_records', '[]'::jsonb),
    coalesce(p_completion->'engineering_artifacts', '[]'::jsonb),
    coalesce(p_completion->'evidence_records', '[]'::jsonb),
    p_completion->'validation_receipt',
    case when jsonb_typeof(p_completion->'storage_objects') = 'array'
         then array(select jsonb_array_elements_text(p_completion->'storage_objects'))
         else '{}'::text[] end,
    coalesce(p_completion->'errors', '[]'::jsonb),
    coalesce(p_completion->'warnings', '[]'::jsonb),
    (p_completion->>'created_by')::uuid
  ) returning * into v_completion;

  v_audit_receipt := public.append_engineering_audit_event(p_audit_record);

  return jsonb_build_object(
    'completion', to_jsonb(v_completion),
    'audit', v_audit_receipt
  );
end;
$function$;

revoke all on function public.append_engineering_audit_event(jsonb) from public, anon, authenticated;
revoke all on function public.verify_engineering_audit_chain() from public, anon, authenticated;
revoke all on function public.record_cad_completion_with_audit(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.append_engineering_audit_event(jsonb) to service_role;
grant execute on function public.verify_engineering_audit_chain() to service_role;
grant execute on function public.record_cad_completion_with_audit(jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
