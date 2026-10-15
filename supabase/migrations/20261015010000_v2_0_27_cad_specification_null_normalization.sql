-- V2.0.27: normalize optional JSON-null CAD specification to SQL NULL.
-- V2.0.26 is already applied to the isolated E2E project; keep that migration immutable.
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
    nullif(p_completion->'specification', 'null'::jsonb),
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

notify pgrst, 'reload schema';
