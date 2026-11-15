-- M2.6: bind generated drawings to the exact accepted geometry revision and source artifact.
-- Existing uploaded drawings remain source documents with NULL generator/lineage fields.
alter table public.engineering_cad_drawings
  add column source_geometry_revision_id uuid,
  add column source_artifact_id text,
  add column source_artifact_sha256 text,
  add column source_revision_number bigint,
  add column generator_id text,
  add column generator_version text,
  add column generation_parameters jsonb;

alter table public.engineering_cad_drawings
  add constraint engineering_cad_drawings_source_digest_check
    check (source_artifact_sha256 is null or source_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint engineering_cad_drawings_source_revision_check
    check (source_revision_number is null or source_revision_number > 0),
  add constraint engineering_cad_drawings_generated_lineage_check
    check (
      (generator_id is null and generator_version is null and source_geometry_revision_id is null
        and source_artifact_id is null and source_artifact_sha256 is null
        and source_revision_number is null and generation_parameters is null)
      or
      (generator_id is not null and length(trim(generator_id)) between 1 and 128
        and generator_version is not null and length(trim(generator_version)) between 1 and 128
        and source_geometry_revision_id is not null
        and source_artifact_id is not null and length(trim(source_artifact_id)) between 1 and 160
        and source_artifact_sha256 is not null
        and source_revision_number is not null
        and generation_parameters is not null and jsonb_typeof(generation_parameters) = 'object'
        and model_identity_id is not null and format = 'SVG' and media_type = 'image/svg+xml')
    ),
  add constraint engineering_cad_drawings_geometry_revision_fkey
    foreign key (project_id, model_identity_id, source_geometry_revision_id)
    references public.engineering_geometry_revisions(project_id, model_identity_id, id)
    on delete restrict;

create unique index engineering_cad_drawings_generated_idempotency_idx
  on public.engineering_cad_drawings(project_id, model_identity_id, source_geometry_revision_id, generator_id, generator_version, sha256)
  where source_geometry_revision_id is not null;

create index engineering_cad_drawings_source_revision_idx
  on public.engineering_cad_drawings(project_id, model_identity_id, source_geometry_revision_id)
  where source_geometry_revision_id is not null;

-- Serialize generated-drawing persistence against geometry revision advancement.
-- A drawing generated from a non-head revision is rejected as stale.
create or replace function private.enforce_generated_cad_drawing_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_revision public.engineering_geometry_revisions%rowtype;
  current_head_id uuid;
begin
  if new.generator_id is null then return new; end if;

  perform 1
    from public.engineering_cad_models as model
   where model.id = new.model_identity_id
     and model.project_id = new.project_id
   for update;
  if not found then
    raise exception using errcode = '23503',
      message = 'Generated drawing model does not belong to the supplied project.';
  end if;

  select revision.*
    into source_revision
    from public.engineering_geometry_revisions as revision
   where revision.id = new.source_geometry_revision_id
     and revision.project_id = new.project_id
     and revision.model_identity_id = new.model_identity_id
   for key share;
  if not found then
    raise exception using errcode = '23503',
      message = 'Generated drawing source geometry revision is not available in this project.';
  end if;

  if source_revision.revision_number is distinct from new.source_revision_number
     or source_revision.canonical_artifact_id is distinct from new.source_artifact_id
     or source_revision.canonical_artifact_sha256 is distinct from new.source_artifact_sha256 then
    raise exception using errcode = '23514',
      message = 'Generated drawing source identity or digest does not match the immutable geometry revision.';
  end if;

  select revision.id into current_head_id
    from public.engineering_geometry_revisions as revision
   where revision.project_id = new.project_id
     and revision.model_identity_id = new.model_identity_id
   order by revision.revision_number desc
   limit 1;
  if current_head_id is distinct from new.source_geometry_revision_id then
    raise exception using errcode = '40001',
      message = 'STALE_DRAWING_SOURCE: source geometry revision is no longer the current model head.';
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_generated_cad_drawing_source() from public, anon, authenticated, service_role;
create trigger engineering_cad_drawings_validate_generated_source
  before insert on public.engineering_cad_drawings
  for each row execute function private.enforce_generated_cad_drawing_source();

comment on column public.engineering_cad_drawings.source_geometry_revision_id is
  'Exact immutable geometry revision used to generate this drawing; uploaded source drawings leave this NULL.';
comment on column public.engineering_cad_drawings.source_artifact_sha256 is
  'Digest of the exact canonical source BREP bytes, independently rechecked before drawing generation.';
comment on column public.engineering_cad_drawings.generator_id is
  'Trusted deterministic drawing generator identity; does not imply drafting-standard compliance or manufacturing release.';

-- Read-only, membership-guarded current-head lookup used by drawing history staleness indicators.
create or replace function public.get_current_geometry_revision_heads(
  p_project_id uuid,
  p_model_identity_ids uuid[]
)
returns table(model_identity_id uuid, revision_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return; end if;
  if not exists (
    select 1
      from public.engineering_project_memberships as membership
     where membership.project_id = p_project_id
       and membership.user_id = v_user_id
  ) then return; end if;

  return query
    select distinct on (revision.model_identity_id)
      revision.model_identity_id,
      revision.id as revision_id
    from public.engineering_geometry_revisions as revision
    where revision.project_id = p_project_id
      and revision.model_identity_id = any(coalesce(p_model_identity_ids, '{}'::uuid[]))
    order by revision.model_identity_id, revision.revision_number desc;
end;
$$;
revoke all on function public.get_current_geometry_revision_heads(uuid,uuid[]) from public, anon;
grant execute on function public.get_current_geometry_revision_heads(uuid,uuid[]) to authenticated;

notify pgrst, 'reload schema';
