-- Add indexes for foreign keys used by CAD completion ownership and model identity.
-- These indexes avoid scans when referenced users or models are deleted/updated.
-- Existing project_id indexes already cover the project foreign keys.
create index if not exists engineering_cad_completions_created_by_idx
  on public.engineering_cad_completions (created_by);

create index if not exists engineering_cad_completions_model_identity_id_idx
  on public.engineering_cad_completions (model_identity_id);

create index if not exists engineering_cad_models_created_by_idx
  on public.engineering_cad_models (created_by);
