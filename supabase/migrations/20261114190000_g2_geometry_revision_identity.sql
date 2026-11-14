-- G2: immutable, project-scoped identity for canonical BREP geometry revisions.
-- This relation indexes existing CAD completion/Storage ownership; it stores no geometry bytes.

create table public.engineering_geometry_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  model_identity_id uuid not null,
  revision_number bigint not null check (revision_number > 0),
  parent_revision_id uuid,
  source_completion_id uuid not null,
  source_operation_id text not null check (length(trim(source_operation_id)) between 1 and 128),
  canonical_artifact_id text not null check (length(trim(canonical_artifact_id)) between 1 and 160),
  storage_bucket text not null default 'engineering-cad-artifacts'
    check (storage_bucket = 'engineering-cad-artifacts'),
  storage_object_name text not null,
  canonical_artifact_sha256 text not null
    check (canonical_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  canonical_format text not null check (canonical_format = 'BREP'),
  units text not null check (units = 'mm'),
  coordinate_frame_id text not null check (coordinate_frame_id = 'WORLD_Z_AXIS'),
  provider_id text not null check (length(trim(provider_id)) between 1 and 128),
  provider_version text not null check (length(trim(provider_version)) between 1 and 128),
  execution_backend text not null check (execution_backend in ('build123d','cadquery')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint engineering_geometry_revisions_parent_shape_check
    check (
      (revision_number = 1 and parent_revision_id is null)
      or (revision_number > 1 and parent_revision_id is not null)
    ),
  constraint engineering_geometry_revisions_storage_path_check
    check (
      storage_object_name =
        project_id::text || '/' || model_identity_id::text || '/' ||
        source_operation_id || '/solid.brep'
      and position('..' in storage_object_name) = 0
      and position(chr(92) in storage_object_name) = 0
    ),
  constraint engineering_geometry_revisions_model_project_fkey
    foreign key (project_id, model_identity_id)
    references public.engineering_cad_models(project_id, id)
    on delete restrict,
  constraint engineering_geometry_revisions_completion_model_project_fkey
    foreign key (project_id, model_identity_id, source_completion_id)
    references public.engineering_cad_completions(project_id, model_identity_id, id)
    on delete restrict,
  constraint engineering_geometry_revisions_parent_model_project_fkey
    foreign key (project_id, model_identity_id, parent_revision_id)
    references public.engineering_geometry_revisions(project_id, model_identity_id, id)
    on delete restrict,
  constraint engineering_geometry_revisions_model_number_key
    unique (project_id, model_identity_id, revision_number),
  constraint engineering_geometry_revisions_model_id_key
    unique (project_id, model_identity_id, id),
  constraint engineering_geometry_revisions_source_artifact_key
    unique (project_id, model_identity_id, source_completion_id, canonical_artifact_id),
  constraint engineering_geometry_revisions_storage_object_key
    unique (storage_bucket, storage_object_name)
);

create index engineering_geometry_revisions_source_completion_idx
  on public.engineering_geometry_revisions(project_id, source_completion_id);

-- Serialize revision allocation against the logical model row. A geometry revision
-- is accepted only when it extends the exact current head and references one
-- accepted SOLID artifact from the same completion and project.
create or replace function private.enforce_engineering_geometry_revision_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  completion public.engineering_cad_completions%rowtype;
  artifact_record jsonb;
  artifact_count integer;
  current_head_id uuid;
  current_head_number bigint;
  expected_storage_uri text;
begin
  perform 1
    from public.engineering_cad_models m
   where m.id = new.model_identity_id
     and m.project_id = new.project_id
   for update;

  if not found then
    raise exception using errcode = '23503',
      message = 'Geometry revision model does not exist in the supplied project.';
  end if;

  select c.*
    into completion
    from public.engineering_cad_completions c
   where c.id = new.source_completion_id
     and c.project_id = new.project_id
     and c.model_identity_id = new.model_identity_id
   for key share;

  if not found then
    raise exception using errcode = '23503',
      message = 'Geometry revision source completion does not match its project and model.';
  end if;

  if completion.status is distinct from 'ACCEPTED'
    or completion.execution_id is null
    or completion.execution_id is distinct from new.source_operation_id then
    raise exception using errcode = '23514',
      message = 'Geometry revision requires an accepted completion with matching operation provenance.';
  end if;

  if jsonb_typeof(completion.validation_receipt) is distinct from 'object'
    or jsonb_typeof(completion.evidence_records) is distinct from 'array'
    or jsonb_typeof(completion.artifact_records) is distinct from 'array' then
    raise exception using errcode = '23514',
      message = 'Geometry revision source completion lacks accepted validation, evidence, or artifact records.';
  end if;

  if jsonb_array_length(completion.evidence_records) = 0 then
    raise exception using errcode = '23514',
      message = 'Geometry revision source completion has no evidence records.';
  end if;

  if not (new.storage_object_name = any(completion.storage_objects)) then
    raise exception using errcode = '23514',
      message = 'Geometry revision Storage object is not owned by its source completion.';
  end if;

  select count(*)
    into artifact_count
    from jsonb_array_elements(completion.artifact_records) as item(value)
   where item.value ->> 'id' = new.canonical_artifact_id;

  if artifact_count <> 1 then
    raise exception using errcode = '23514',
      message = 'Canonical artifact ID must resolve to exactly one source completion artifact record.';
  end if;

  select item.value
    into artifact_record
    from jsonb_array_elements(completion.artifact_records) as item(value)
   where item.value ->> 'id' = new.canonical_artifact_id
   limit 1;

  expected_storage_uri := 'storage://' || new.storage_bucket || '/' || new.storage_object_name;

  if artifact_record ->> 'kind' is distinct from 'SOLID'
    or artifact_record ->> 'validationStatus' is distinct from 'PASS'
    or artifact_record ->> 'uri' is distinct from expected_storage_uri
    or artifact_record -> 'provenance' ->> 'artifactSha256' is distinct from new.canonical_artifact_sha256
    or artifact_record -> 'provenance' ->> 'providerId' is distinct from new.provider_id
    or artifact_record -> 'provenance' ->> 'backend' is distinct from new.execution_backend then
    raise exception using errcode = '23514',
      message = 'Geometry revision canonical artifact, digest, provider, or Storage lineage does not match the accepted completion manifest.';
  end if;

  select r.id, r.revision_number
    into current_head_id, current_head_number
    from public.engineering_geometry_revisions r
   where r.project_id = new.project_id
     and r.model_identity_id = new.model_identity_id
   order by r.revision_number desc
   limit 1;

  if current_head_id is distinct from new.parent_revision_id then
    raise exception using errcode = '40001',
      message = 'STALE_GEOMETRY_REVISION: expected parent is not the current geometry revision head.';
  end if;

  if new.revision_number <> coalesce(current_head_number, 0) + 1 then
    raise exception using errcode = '40001',
      message = 'Geometry revision number must be the next monotonic revision for this model.';
  end if;

  return new;
end;
$$;

create or replace function private.reject_engineering_geometry_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  raise exception using errcode = '55000',
    message = 'Geometry revisions are immutable; create a new child revision instead.';
end;
$$;

revoke all on function private.enforce_engineering_geometry_revision_insert() from public, anon, authenticated, service_role;
revoke all on function private.reject_engineering_geometry_revision_mutation() from public, anon, authenticated, service_role;

create trigger engineering_geometry_revisions_validate_insert
  before insert on public.engineering_geometry_revisions
  for each row execute function private.enforce_engineering_geometry_revision_insert();

create trigger engineering_geometry_revisions_immutable
  before update or delete on public.engineering_geometry_revisions
  for each row execute function private.reject_engineering_geometry_revision_mutation();

alter table public.engineering_geometry_revisions enable row level security;

revoke all on table public.engineering_geometry_revisions from public, anon, authenticated, service_role;
grant select, insert on table public.engineering_geometry_revisions to service_role;

comment on table public.engineering_geometry_revisions is
  'Immutable project-scoped identity and lineage for canonical BREP geometry revisions. References existing CAD completion manifests and private Storage objects; stores no geometry bytes.';
comment on column public.engineering_geometry_revisions.canonical_artifact_id is
  'Artifact ID resolved and verified against the source completion JSONB artifact_records; deliberately not a relational foreign key.';
comment on column public.engineering_geometry_revisions.canonical_artifact_sha256 is
  'SHA-256 of the exact canonical BREP bytes, recomputed by the trusted server from the existing private Storage object before insert.';
comment on column public.engineering_geometry_revisions.storage_object_name is
  'Exact immutable execution-scoped object path already owned by the source completion; uploads use upsert=false, so G2 does not duplicate artifact bytes.';
