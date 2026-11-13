-- M2.2/M2.6: immutable project-scoped display derivatives and drawing source records.
-- Canonical CAD completion artifacts remain immutable; these tables register derived/read-only artifacts.

create table public.engineering_cad_display_derivatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.engineering_projects(id) on delete cascade,
  model_identity_id uuid not null references public.engineering_cad_models(id) on delete cascade,
  completion_id uuid not null references public.engineering_cad_completions(id) on delete cascade,
  source_artifact_id text not null check (length(trim(source_artifact_id)) between 1 and 160),
  source_artifact_sha256 text not null check (source_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  model_revision bigint not null check (model_revision > 0),
  storage_object_path text not null unique,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  media_type text not null check (media_type = 'model/gltf-binary'),
  converter_provider_id text not null check (length(trim(converter_provider_id)) between 1 and 128),
  converter_version text not null check (length(trim(converter_version)) between 1 and 128),
  linear_deflection_mm double precision not null check (linear_deflection_mm between 0.001 and 5),
  angular_deflection_rad double precision not null check (angular_deflection_rad between 0.01 and 1.5707963267948966),
  units text not null check (units = 'mm'),
  coordinate_frame text not null check (coordinate_frame = 'MODEL'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (storage_object_path like project_id::text || '/%'),
  check (position('..' in storage_object_path) = 0),
  unique (project_id, model_identity_id, source_artifact_id, source_artifact_sha256,
          model_revision, converter_provider_id, converter_version,
          linear_deflection_mm, angular_deflection_rad)
);

create index engineering_cad_display_derivatives_project_model_idx
  on public.engineering_cad_display_derivatives(project_id, model_identity_id, created_at desc);

-- Serialize derivative insertion against model revision changes. This prevents a
-- worker that started on revision N from registering its result as current after N+1.
create or replace function private.enforce_current_cad_display_derivative_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $
declare
  current_revision bigint;
begin
  select m.revision
    into current_revision
    from public.engineering_cad_models m
   where m.id = new.model_identity_id
     and m.project_id = new.project_id
   for update;

  if current_revision is null or current_revision <> new.model_revision then
    raise exception using
      errcode = '40001',
      message = 'CAD model revision changed before display derivative persistence.';
  end if;
  return new;
end;
$;

revoke all on function private.enforce_current_cad_display_derivative_revision() from public, anon, authenticated;
create trigger engineering_cad_display_derivatives_current_revision
  before insert on public.engineering_cad_display_derivatives
  for each row execute function private.enforce_current_cad_display_derivative_revision();

create table public.engineering_cad_drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.engineering_projects(id) on delete cascade,
  model_identity_id uuid references public.engineering_cad_models(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 180),
  format text not null check (format in ('PDF','SVG','DXF')),
  media_type text not null check (media_type in ('application/pdf','image/svg+xml','application/dxf')),
  byte_size bigint not null check (byte_size between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_object_path text not null unique,
  parser_version text not null check (length(trim(parser_version)) between 1 and 128),
  units text,
  entity_count integer check (entity_count is null or entity_count between 0 and 10000),
  bounds jsonb check (bounds is null or jsonb_typeof(bounds) = 'object'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (storage_object_path like project_id::text || '/%'),
  check (position('..' in storage_object_path) = 0)
);

create index engineering_cad_drawings_project_created_idx
  on public.engineering_cad_drawings(project_id, created_at desc);
create index engineering_cad_drawings_model_created_idx
  on public.engineering_cad_drawings(project_id, model_identity_id, created_at desc);

alter table public.engineering_cad_display_derivatives enable row level security;
alter table public.engineering_cad_drawings enable row level security;

revoke all on table public.engineering_cad_display_derivatives from public, anon, authenticated, service_role;
revoke all on table public.engineering_cad_drawings from public, anon, authenticated, service_role;
grant select on table public.engineering_cad_display_derivatives to authenticated;
grant select on table public.engineering_cad_drawings to authenticated;
grant select, insert, delete on table public.engineering_cad_display_derivatives to service_role;
grant select, insert, delete on table public.engineering_cad_drawings to service_role;

create policy engineering_cad_display_derivatives_select_member
  on public.engineering_cad_display_derivatives for select to authenticated
  using ((select private.is_project_member(project_id)));

create policy engineering_cad_drawings_select_member
  on public.engineering_cad_drawings for select to authenticated
  using ((select private.is_project_member(project_id)));

-- No authenticated insert/update/delete policies: all writes are server-authorized after
-- project membership and role checks. Derivative and drawing records are immutable.
