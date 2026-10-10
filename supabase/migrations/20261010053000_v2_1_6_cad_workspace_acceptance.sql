-- V2.1.6: project-scoped CAD model identities, immutable completion records, and private artifact storage.
create table public.engineering_cad_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.engineering_projects(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  native_references jsonb not null default '[]'::jsonb check (jsonb_typeof(native_references) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);

create table public.engineering_cad_completions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.engineering_projects(id) on delete cascade,
  model_identity_id uuid references public.engineering_cad_models(id) on delete set null,
  execution_id text,
  status text not null check (status in ('ACCEPTED','REJECTED','INCOMPLETE','NEEDS_INPUT','UNSUPPORTED','BLOCKED','FAILED')),
  stage text not null check (stage in ('INTENT','SOURCE_GENERATION','EXECUTION','VALIDATION','ACCEPTANCE')),
  raw_intent text not null check (length(trim(raw_intent)) between 1 and 5000),
  intent_resolution jsonb not null check (jsonb_typeof(intent_resolution) = 'object'),
  specification jsonb check (specification is null or jsonb_typeof(specification) = 'object'),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_records jsonb not null default '[]'::jsonb check (jsonb_typeof(artifact_records) = 'array'),
  engineering_artifacts jsonb not null default '[]'::jsonb check (jsonb_typeof(engineering_artifacts) = 'array'),
  evidence_records jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_records) = 'array'),
  validation_receipt jsonb,
  storage_objects text[] not null default '{}'::text[],
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint accepted_cad_completion_has_verified_evidence check (
    status <> 'ACCEPTED'
    or (jsonb_array_length(evidence_records) > 0 and cardinality(storage_objects) > 0 and validation_receipt is not null)
  )
);
create unique index engineering_cad_completions_execution_idx
  on public.engineering_cad_completions(project_id, execution_id) where execution_id is not null;
create index engineering_cad_models_project_created_idx
  on public.engineering_cad_models(project_id, created_at desc);
create index engineering_cad_completions_project_created_idx
  on public.engineering_cad_completions(project_id, created_at desc);

alter table public.engineering_cad_models enable row level security;
alter table public.engineering_cad_completions enable row level security;
revoke all on table public.engineering_cad_models from anon, authenticated;
revoke all on table public.engineering_cad_completions from anon, authenticated;
grant select, insert on table public.engineering_cad_models to authenticated;
grant select, insert on table public.engineering_cad_completions to authenticated;

create policy engineering_cad_models_select_member on public.engineering_cad_models
  for select to authenticated using ((select private.is_project_member(project_id)));
create policy engineering_cad_models_insert_engineer on public.engineering_cad_models
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select private.has_project_role(project_id, array['ADMIN','ENGINEER']::public.engineering_project_role[]))
  );
create policy engineering_cad_completions_select_member on public.engineering_cad_completions
  for select to authenticated using ((select private.is_project_member(project_id)));
create policy engineering_cad_completions_insert_engineer on public.engineering_cad_completions
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select private.has_project_role(project_id, array['ADMIN','ENGINEER']::public.engineering_project_role[]))
  );

-- Objects are private. Project UUID is always the first path segment; SELECT is membership-scoped,
-- while upload/delete also require an engineering write role.
insert into storage.buckets (id, name, public, file_size_limit)
values ('engineering-cad-artifacts', 'engineering-cad-artifacts', false, 104857600)
on conflict (id) do nothing;

create policy engineering_cad_artifacts_select_member on storage.objects
  for select to authenticated using (
    bucket_id = 'engineering-cad-artifacts'
    and exists (
      select 1 from public.engineering_project_memberships m
      where m.project_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
    )
  );
create policy engineering_cad_artifacts_insert_engineer on storage.objects
  for insert to authenticated with check (
    bucket_id = 'engineering-cad-artifacts'
    and exists (
      select 1 from public.engineering_project_memberships m
      where m.project_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role in ('ADMIN','ENGINEER')
    )
  );
create policy engineering_cad_artifacts_delete_engineer on storage.objects
  for delete to authenticated using (
    bucket_id = 'engineering-cad-artifacts'
    and exists (
      select 1 from public.engineering_project_memberships m
      where m.project_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role in ('ADMIN','ENGINEER')
    )
  );
