-- Tie durable manufacturing evidence to a real project row.
alter table public.engineering_manufacturing_assessments
  add constraint engineering_manufacturing_assessments_project_fkey
  foreign key (project_id)
  references public.engineering_projects(id)
  on delete restrict;
