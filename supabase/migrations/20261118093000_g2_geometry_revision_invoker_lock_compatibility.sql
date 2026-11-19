-- G2: preserve least-privilege invoker execution for atomic geometry revision persistence.
-- Accepted CAD completion rows are append-only for service_role (SELECT/INSERT only).
-- SELECT ... FOR KEY SHARE in this SECURITY INVOKER RPC implicitly requires UPDATE
-- privilege on engineering_cad_completions, which is intentionally not granted.
-- The trusted SECURITY DEFINER revision-insert trigger independently locks the model
-- row, locks/revalidates the accepted completion, and serializes revision-head writes.

create or replace function public.record_geometry_revision_with_audit(
  p_revision jsonb,
  p_audit_record jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_revision public.engineering_geometry_revisions%rowtype;
  v_audit_receipt jsonb;
  v_id uuid;
  v_completion public.engineering_cad_completions%rowtype;
  v_artifact jsonb;
begin
  if jsonb_typeof(p_revision) <> 'object' or jsonb_typeof(p_audit_record) <> 'object' then
    raise exception 'Geometry revision and audit payloads must be JSON objects.' using errcode = '22023';
  end if;
  v_id := (p_revision->>'id')::uuid;
  if (p_audit_record->>'resource_id') is distinct from v_id::text
     or (p_audit_record->>'project_id') is distinct from (p_revision->>'project_id')
     or (p_audit_record->>'resource_type') is distinct from 'GEOMETRY_REVISION'
     or (p_audit_record->>'actor_subject') is distinct from (p_revision->>'created_by')
     or (p_audit_record->>'task_id') is distinct from (p_revision->>'model_identity_id')
     or nullif(btrim(p_audit_record->>'request_id'), '') is null then
    raise exception 'Geometry revision and audit correlation does not match.' using errcode = '22023';
  end if;

  -- No row lock here: service_role deliberately has no UPDATE privilege on
  -- engineering_cad_completions. The INSERT trigger below rechecks and locks it
  -- under its SECURITY DEFINER owner before accepting the revision.
  select c.* into v_completion
    from public.engineering_cad_completions c
   where c.id = (p_revision->>'source_completion_id')::uuid
     and c.project_id = (p_revision->>'project_id')::uuid
     and c.model_identity_id = (p_revision->>'model_identity_id')::uuid;
  if not found or v_completion.status is distinct from 'ACCEPTED' then
    raise exception 'Geometry revision requires an accepted source completion.' using errcode = '23514';
  end if;

  select item.value into v_artifact
    from jsonb_array_elements(v_completion.artifact_records) as item(value)
   where item.value->>'id' = p_revision->>'canonical_artifact_id'
     and item.value->>'kind' = 'SOLID'
   limit 1;
  if v_artifact is null
     or v_artifact->>'validationStatus' is distinct from 'PASS'
     or v_artifact->'provenance'->>'providerVersion' is distinct from p_revision->>'provider_version' then
    raise exception 'Canonical SOLID artifact or trusted provider version does not match the accepted completion.' using errcode = '23514';
  end if;

  insert into public.engineering_geometry_revisions (
    id, project_id, model_identity_id, revision_number, parent_revision_id,
    source_completion_id, source_operation_id, canonical_artifact_id,
    storage_bucket, storage_object_name, canonical_artifact_sha256,
    canonical_format, units, coordinate_frame_id, provider_id, provider_version,
    execution_backend, created_by
  ) values (
    v_id, (p_revision->>'project_id')::uuid, (p_revision->>'model_identity_id')::uuid,
    (p_revision->>'revision_number')::bigint, nullif(p_revision->>'parent_revision_id', '')::uuid,
    (p_revision->>'source_completion_id')::uuid, p_revision->>'source_operation_id',
    p_revision->>'canonical_artifact_id', p_revision->>'storage_bucket',
    p_revision->>'storage_object_name', p_revision->>'canonical_artifact_sha256',
    p_revision->>'canonical_format', p_revision->>'units', p_revision->>'coordinate_frame_id',
    p_revision->>'provider_id', p_revision->>'provider_version',
    p_revision->>'execution_backend', (p_revision->>'created_by')::uuid
  ) returning * into v_revision;

  v_audit_receipt := public.append_engineering_audit_event(p_audit_record);
  return jsonb_build_object('revision', to_jsonb(v_revision), 'audit', v_audit_receipt);
end;
$function$;

revoke all on function public.record_geometry_revision_with_audit(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_geometry_revision_with_audit(jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
