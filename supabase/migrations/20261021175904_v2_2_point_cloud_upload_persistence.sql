-- V2.2: authenticated, project-scoped point-cloud source upload intake.
-- UPLOADED proves byte/hash/header preflight only; Open3D measurement and registration
-- acceptance are separate later stages and are never inferred here.

create table public.engineering_point_cloud_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.engineering_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null check (
    length(trim(file_name)) between 1 and 160
    and position('/' in file_name) = 0
    and position(chr(92) in file_name) = 0
    and file_name !~ '[[:cntrl:]]'
  ),
  format text not null check (format in ('PLY','PCD','XYZ')),
  units text not null check (units in ('mm','cm','m','in')),
  coordinate_frame text not null check (
    length(trim(coordinate_frame)) between 1 and 128
    and coordinate_frame !~ '[[:cntrl:]]'
  ),
  storage_bucket text not null default 'engineering-point-clouds'
    check (storage_bucket = 'engineering-point-clouds'),
  storage_path text not null unique,
  expected_size_bytes bigint not null check (expected_size_bytes between 1 and 41943040),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  declared_point_count integer check (declared_point_count is null or declared_point_count between 3 and 2000000),
  status text not null default 'UPLOADING'
    check (status in ('UPLOADING','UPLOADED','FAILED','EXPIRED')),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  upload_expires_at timestamptz not null default (now() + interval '2 hours'),
  uploaded_at timestamptz,
  constraint engineering_point_cloud_storage_path_check check (
    storage_path = project_id::text || '/' || id::text || '/source.' || lower(format)
  ),
  constraint engineering_point_cloud_uploaded_state_check check (
    status <> 'UPLOADED'
    or (sha256 is not null and declared_point_count is not null and uploaded_at is not null and failure_code is null)
  ),
  constraint engineering_point_cloud_terminal_state_check check (
    status not in ('FAILED','EXPIRED') or failure_code is not null
  ),
  constraint engineering_point_cloud_uploading_state_check check (
    status <> 'UPLOADING'
    or (sha256 is null and declared_point_count is null and uploaded_at is null)
  ),
  unique (project_id, id)
);

create index engineering_point_cloud_project_created_idx
  on public.engineering_point_cloud_artifacts (project_id, created_at desc);
create index engineering_point_cloud_pending_upload_idx
  on public.engineering_point_cloud_artifacts (project_id, upload_expires_at)
  where status = 'UPLOADING';
create index engineering_point_cloud_created_by_idx
  on public.engineering_point_cloud_artifacts (created_by);

alter table public.engineering_point_cloud_artifacts enable row level security;
revoke all on table public.engineering_point_cloud_artifacts from public, anon, authenticated, service_role;
grant select, update on table public.engineering_point_cloud_artifacts to service_role;

-- Direct source upload uses a path-scoped signed token, not caller-supplied storage URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('engineering-point-clouds', 'engineering-point-clouds', false, 41943040)
on conflict (id) do update
  set name = excluded.name,
      public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists engineering_point_clouds_select_member on storage.objects;
create policy engineering_point_clouds_select_member on storage.objects
  for select to authenticated using (
    bucket_id = 'engineering-point-clouds'
    and exists (
      select 1 from public.engineering_project_memberships m
      where m.project_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
    )
  );

create or replace function public.create_engineering_point_cloud_upload_with_audit(
  p_artifact jsonb,
  p_audit_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_project_id uuid;
  v_created_by uuid;
  v_artifact public.engineering_point_cloud_artifacts%rowtype;
  v_audit jsonb;
  v_pending_count integer;
begin
  if p_artifact is null or jsonb_typeof(p_artifact) <> 'object'
     or p_audit_record is null or jsonb_typeof(p_audit_record) <> 'object' then
    raise exception 'Point-cloud upload and audit records must be JSON objects.' using errcode = '22023';
  end if;

  v_id := (p_artifact->>'id')::uuid;
  v_project_id := (p_artifact->>'project_id')::uuid;
  v_created_by := (p_artifact->>'created_by')::uuid;

  if p_audit_record->>'action' is distinct from 'EVIDENCE_WRITE'
     or p_audit_record->>'outcome' is distinct from 'PENDING'
     or p_audit_record->>'resource_type' is distinct from 'POINT_CLOUD_ARTIFACT'
     or p_audit_record->>'resource_id' is distinct from v_id::text
     or p_audit_record->>'project_id' is distinct from v_project_id::text
     or p_audit_record->>'actor_subject' is distinct from v_created_by::text then
    raise exception 'Point-cloud upload audit correlation is invalid.' using errcode = '22023';
  end if;

  perform 1 from public.engineering_projects p where p.id = v_project_id for update;
  if not found then
    return jsonb_build_object('errorCode', 'PROJECT_NOT_FOUND');
  end if;

  select count(*) into v_pending_count
    from public.engineering_point_cloud_artifacts a
   where a.project_id = v_project_id
     and a.status = 'UPLOADING'
     and a.upload_expires_at > now();
  if v_pending_count >= 5 then
    return jsonb_build_object('errorCode', 'TOO_MANY_PENDING_UPLOADS');
  end if;

  insert into public.engineering_point_cloud_artifacts (
    id, project_id, created_by, file_name, format, units,
    coordinate_frame, storage_bucket, storage_path, expected_size_bytes
  ) values (
    v_id, v_project_id, v_created_by,
    p_artifact->>'file_name',
    p_artifact->>'format',
    p_artifact->>'units',
    p_artifact->>'coordinate_frame',
    p_artifact->>'storage_bucket',
    p_artifact->>'storage_path',
    (p_artifact->>'expected_size_bytes')::bigint
  )
  returning * into v_artifact;

  v_audit := public.append_engineering_audit_event(p_audit_record);
  return jsonb_build_object('artifact', to_jsonb(v_artifact), 'audit', v_audit);
end;
$function$;

create or replace function public.finalize_engineering_point_cloud_upload_with_audit(
  p_artifact_id uuid,
  p_project_id uuid,
  p_sha256 text,
  p_declared_point_count integer,
  p_audit_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_artifact public.engineering_point_cloud_artifacts%rowtype;
  v_audit jsonb;
begin
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_declared_point_count is null or p_declared_point_count < 3 or p_declared_point_count > 2000000
     or p_audit_record is null or jsonb_typeof(p_audit_record) <> 'object' then
    raise exception 'Point-cloud upload verification fields are invalid.' using errcode = '22023';
  end if;

  if p_audit_record->>'action' is distinct from 'EVIDENCE_WRITE'
     or p_audit_record->>'outcome' is distinct from 'SUCCESS'
     or p_audit_record->>'resource_type' is distinct from 'POINT_CLOUD_ARTIFACT'
     or p_audit_record->>'resource_id' is distinct from p_artifact_id::text
     or p_audit_record->>'project_id' is distinct from p_project_id::text
     or p_audit_record->>'artifact_sha256' is distinct from p_sha256 then
    raise exception 'Point-cloud upload finalization audit correlation is invalid.' using errcode = '22023';
  end if;

  update public.engineering_point_cloud_artifacts
     set status = 'UPLOADED',
         sha256 = p_sha256,
         declared_point_count = p_declared_point_count,
         uploaded_at = now(),
         failure_code = null
   where id = p_artifact_id
     and project_id = p_project_id
     and status = 'UPLOADING'
     and upload_expires_at > now()
  returning * into v_artifact;

  if not found then
    raise exception 'Point-cloud upload is expired or not in a finalizable state.' using errcode = '55000';
  end if;

  v_audit := public.append_engineering_audit_event(p_audit_record);
  return jsonb_build_object('artifact', to_jsonb(v_artifact), 'audit', v_audit);
end;
$function$;

create or replace function public.fail_engineering_point_cloud_upload_with_audit(
  p_artifact_id uuid,
  p_project_id uuid,
  p_terminal_status text,
  p_failure_code text,
  p_audit_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_artifact public.engineering_point_cloud_artifacts%rowtype;
  v_audit jsonb;
begin
  if p_terminal_status not in ('FAILED','EXPIRED')
     or p_failure_code is null or p_failure_code !~ '^[A-Z0-9_]{1,80}$'
     or p_audit_record is null or jsonb_typeof(p_audit_record) <> 'object' then
    raise exception 'Point-cloud upload terminal state is invalid.' using errcode = '22023';
  end if;

  if p_audit_record->>'action' is distinct from 'EVIDENCE_WRITE'
     or p_audit_record->>'outcome' is distinct from 'FAILURE'
     or p_audit_record->>'resource_type' is distinct from 'POINT_CLOUD_ARTIFACT'
     or p_audit_record->>'resource_id' is distinct from p_artifact_id::text
     or p_audit_record->>'project_id' is distinct from p_project_id::text
     or p_audit_record->'metadata'->>'failureCode' is distinct from p_failure_code
     or p_audit_record->'metadata'->>'status' is distinct from p_terminal_status then
    raise exception 'Point-cloud upload failure audit correlation is invalid.' using errcode = '22023';
  end if;

  update public.engineering_point_cloud_artifacts
     set status = p_terminal_status,
         failure_code = p_failure_code,
         sha256 = null,
         declared_point_count = null,
         uploaded_at = null
   where id = p_artifact_id
     and project_id = p_project_id
     and status = 'UPLOADING'
  returning * into v_artifact;

  if not found then
    raise exception 'Point-cloud upload is not in a terminalizable state.' using errcode = '55000';
  end if;

  v_audit := public.append_engineering_audit_event(p_audit_record);
  return jsonb_build_object('artifact', to_jsonb(v_artifact), 'audit', v_audit);
end;
$function$;

revoke all on function public.create_engineering_point_cloud_upload_with_audit(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.finalize_engineering_point_cloud_upload_with_audit(uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.fail_engineering_point_cloud_upload_with_audit(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_engineering_point_cloud_upload_with_audit(jsonb,jsonb) to service_role;
grant execute on function public.finalize_engineering_point_cloud_upload_with_audit(uuid,uuid,text,integer,jsonb) to service_role;
grant execute on function public.fail_engineering_point_cloud_upload_with_audit(uuid,uuid,text,text,jsonb) to service_role;
