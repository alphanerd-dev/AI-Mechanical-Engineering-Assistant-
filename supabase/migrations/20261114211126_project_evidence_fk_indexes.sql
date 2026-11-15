-- Cover all exposed project evidence foreign keys used for referential checks.
create index if not exists engineering_cad_display_derivatives_created_by_idx
  on public.engineering_cad_display_derivatives(created_by);
create index if not exists engineering_cad_drawings_created_by_idx
  on public.engineering_cad_drawings(created_by);
create index if not exists engineering_geometry_revisions_created_by_idx
  on public.engineering_geometry_revisions(created_by);
create index if not exists engineering_geometry_revisions_parent_model_project_idx
  on public.engineering_geometry_revisions(project_id, model_identity_id, parent_revision_id);
create index if not exists engineering_manufacturing_assessments_created_by_idx
  on public.engineering_manufacturing_assessments(created_by);
create index if not exists engineering_manufacturing_decisions_decided_by_idx
  on public.engineering_manufacturing_decisions(decided_by);
