-- V2.0.34: align durable execution backend constraint with the API's allowlisted solver backends.
-- Additive, data-preserving constraint replacement; does not enable durable execution.
alter table public.engineering_execution_jobs
  drop constraint if exists engineering_execution_jobs_backend_check;

alter table public.engineering_execution_jobs
  add constraint engineering_execution_jobs_backend_check
  check (backend in ('typescript-safe', 'python-worker', 'fea-worker', 'cfd-worker'));

comment on column public.engineering_execution_jobs.backend is
  'Allowlisted durable execution backend. CAD worker execution remains outside this queue contract.';
