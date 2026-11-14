-- Durable manufacturing assessment snapshots and human release decisions.
create table public.engineering_manufacturing_assessments (
  id uuid primary key,
  project_id uuid not null,
  release_id text not null check (length(trim(release_id)) between 1 and 160),
  status text not null check (status in ('INCOMPLETE','BLOCKED','READY_FOR_HUMAN_APPROVAL')),
  process_plan jsonb not null check (jsonb_typeof(process_plan) = 'object'),
  bom_snapshot jsonb not null check (jsonb_typeof(bom_snapshot) = 'object'),
  readiness_snapshot jsonb not null check (jsonb_typeof(readiness_snapshot) = 'object'),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  required_artifact_ids text[] not null default '{}',
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint engineering_manufacturing_assessments_project_release_key unique (project_id, release_id),
  constraint engineering_manufacturing_assessments_project_id_key unique (project_id, id)
);

create table public.engineering_manufacturing_decisions (
  id uuid primary key,
  project_id uuid not null,
  assessment_id uuid not null,
  decision text not null check (decision in ('APPROVED','REJECTED')),
  comment text,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  foreign key (project_id, assessment_id)
    references public.engineering_manufacturing_assessments(project_id, id) on delete restrict
);

create index engineering_manufacturing_assessments_project_created_idx
  on public.engineering_manufacturing_assessments(project_id, created_at desc);
create index engineering_manufacturing_decisions_assessment_idx
  on public.engineering_manufacturing_decisions(project_id, assessment_id, decided_at desc);
create unique index engineering_manufacturing_one_decision_per_assessment
  on public.engineering_manufacturing_decisions(assessment_id);

alter table public.engineering_manufacturing_assessments enable row level security;
alter table public.engineering_manufacturing_decisions enable row level security;
revoke all on public.engineering_manufacturing_assessments from public, anon, authenticated;
revoke all on public.engineering_manufacturing_decisions from public, anon, authenticated;
grant select, insert on public.engineering_manufacturing_assessments to service_role;
grant select, insert on public.engineering_manufacturing_decisions to service_role;

create or replace function private.prevent_manufacturing_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Manufacturing evidence and release decisions are append-only.' using errcode = '55000';
end;
$function$;

create trigger engineering_manufacturing_assessments_append_only
before update or delete on public.engineering_manufacturing_assessments
for each row execute function private.prevent_manufacturing_record_mutation();

create trigger engineering_manufacturing_decisions_append_only
before update or delete on public.engineering_manufacturing_decisions
for each row execute function private.prevent_manufacturing_record_mutation();

create or replace function public.record_manufacturing_assessment_with_audit(
  p_assessment jsonb,
  p_audit_record jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_assessment public.engineering_manufacturing_assessments%rowtype;
  v_audit jsonb;
  v_id uuid;
begin
  v_id := (p_assessment->>'id')::uuid;
  if (p_audit_record->>'resource_id') is distinct from v_id::text
     or (p_audit_record->>'project_id') is distinct from (p_assessment->>'project_id')
     or (p_audit_record->>'actor_subject') is distinct from (p_assessment->>'created_by')
     or (p_audit_record->>'resource_type') is distinct from 'MANUFACTURING_ASSESSMENT'
     or (p_audit_record->>'action') is distinct from 'EVIDENCE_WRITE'
     or nullif(btrim(p_audit_record->>'request_id'), '') is null then
    raise exception 'Manufacturing assessment and audit correlation does not match.' using errcode = '22023';
  end if;

  insert into public.engineering_manufacturing_assessments (
    id, project_id, release_id, status, process_plan, bom_snapshot,
    readiness_snapshot, input_snapshot, required_artifact_ids, input_sha256, created_by
  ) values (
    v_id, (p_assessment->>'project_id')::uuid, p_assessment->>'release_id',
    p_assessment->>'status', p_assessment->'process_plan', p_assessment->'bom_snapshot',
    p_assessment->'readiness_snapshot', p_assessment->'input_snapshot',
    array(select jsonb_array_elements_text(p_assessment->'required_artifact_ids')),
    p_assessment->>'input_sha256', (p_assessment->>'created_by')::uuid
  ) returning * into v_assessment;

  v_audit := public.append_engineering_audit_event(p_audit_record);
  return jsonb_build_object('assessment', to_jsonb(v_assessment), 'audit', v_audit);
end;
$function$;

create or replace function public.record_manufacturing_decision_with_audit(
  p_decision jsonb,
  p_audit_record jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_assessment public.engineering_manufacturing_assessments%rowtype;
  v_decision public.engineering_manufacturing_decisions%rowtype;
  v_audit jsonb;
  v_id uuid;
begin
  v_id := (p_decision->>'id')::uuid;
  if (p_audit_record->>'resource_id') is distinct from v_id::text
     or (p_audit_record->>'project_id') is distinct from (p_decision->>'project_id')
     or (p_audit_record->>'actor_subject') is distinct from (p_decision->>'decided_by')
     or (p_audit_record->>'resource_type') is distinct from 'MANUFACTURING_DECISION'
     or (p_audit_record->>'action') is distinct from 'APPROVAL_GRANT'
     or nullif(btrim(p_audit_record->>'request_id'), '') is null then
    raise exception 'Manufacturing decision and audit correlation does not match.' using errcode = '22023';
  end if;

  select a.* into v_assessment
    from public.engineering_manufacturing_assessments a
   where a.id = (p_decision->>'assessment_id')::uuid
     and a.project_id = (p_decision->>'project_id')::uuid
   for update;
  if not found or v_assessment.status is distinct from 'READY_FOR_HUMAN_APPROVAL' then
    raise exception 'Only a readiness-approved manufacturing assessment can receive a human decision.' using errcode = '23514';
  end if;
  if v_assessment.created_by = (p_decision->>'decided_by')::uuid then
    raise exception 'The assessment author cannot approve or reject their own manufacturing release.' using errcode = '42501';
  end if;

  insert into public.engineering_manufacturing_decisions (
    id, project_id, assessment_id, decision, comment, decided_by
  ) values (
    v_id, (p_decision->>'project_id')::uuid, (p_decision->>'assessment_id')::uuid,
    p_decision->>'decision', p_decision->>'comment', (p_decision->>'decided_by')::uuid
  ) returning * into v_decision;

  v_audit := public.append_engineering_audit_event(p_audit_record);
  return jsonb_build_object('decision', to_jsonb(v_decision), 'audit', v_audit);
end;
$function$;

revoke all on function public.record_manufacturing_assessment_with_audit(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_manufacturing_decision_with_audit(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_manufacturing_assessment_with_audit(jsonb, jsonb) to service_role;
grant execute on function public.record_manufacturing_decision_with_audit(jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
