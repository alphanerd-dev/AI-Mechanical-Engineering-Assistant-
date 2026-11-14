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

  -- Serialize decisions per project/assessment without granting UPDATE on the
  -- append-only assessment table. The lock is transaction-scoped and released
  -- automatically on commit/rollback.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      (p_decision->>'project_id') || ':' || (p_decision->>'assessment_id'),
      0
    )
  );

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
     and a.project_id = (p_decision->>'project_id')::uuid;
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

revoke all on function public.record_manufacturing_decision_with_audit(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_manufacturing_decision_with_audit(jsonb, jsonb)
  to service_role;
