-- V2.0.29: durable project-scoped execution jobs with idempotency and worker leases.
-- Review only: reconcile remote migration-ledger drift before applying to a shared environment.
create table public.engineering_execution_jobs (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.engineering_projects(id) on delete cascade,
 idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
 request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
 capability text not null check (length(trim(capability)) between 1 and 128),
 backend text not null check (backend in ('typescript-safe','python-worker')),
 request jsonb not null check (jsonb_typeof(request) = 'object'),
 status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
 attempts integer not null default 0 check (attempts >= 0),
 max_attempts integer not null default 3 check (max_attempts between 1 and 5),
 next_attempt_at timestamptz not null default now(),
 result jsonb,error text,error_code text,
 artifact_ids text[] not null default '{}',evidence_ids text[] not null default '{}',
 provenance jsonb,attempt_history jsonb not null default '[]'::jsonb check (jsonb_typeof(attempt_history) = 'array'),
 queued_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz,cancel_requested_at timestamptz,
 lease_owner text,lease_token uuid,lease_expires_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint engineering_execution_jobs_idempotency_unique unique (owner_id,project_id,idempotency_key),
 constraint engineering_execution_jobs_lease_consistency check (
  (status='RUNNING' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
  or (status<>'RUNNING' and lease_owner is null and lease_token is null and lease_expires_at is null)
 )
);
create index engineering_execution_jobs_claim_idx on public.engineering_execution_jobs(status,next_attempt_at,queued_at,created_at) where status in ('QUEUED','RUNNING');
create index engineering_execution_jobs_project_history_idx on public.engineering_execution_jobs(project_id,created_at desc);
create index engineering_execution_jobs_owner_history_idx on public.engineering_execution_jobs(owner_id,created_at desc);
alter table public.engineering_execution_jobs enable row level security;
revoke all on table public.engineering_execution_jobs from anon,authenticated;
grant select,insert,update on table public.engineering_execution_jobs to service_role;
comment on table public.engineering_execution_jobs is 'Server-managed durable execution jobs. API routes authorize project membership before server-role store access.';
comment on column public.engineering_execution_jobs.request_hash is 'SHA-256 over canonical execution request fields, excluding generated request and correlation IDs.';
comment on column public.engineering_execution_jobs.lease_token is 'Fencing token prevents an expired worker from committing after a different worker claims the job.';

create or replace function public.claim_engineering_execution_job(p_worker_id text,p_lease_seconds integer default 45)
returns setof public.engineering_execution_jobs
language plpgsql security definer set search_path = ''
as $$
begin
 if p_worker_id is null or length(trim(p_worker_id)) < 1 or length(p_worker_id) > 128 then raise exception 'Invalid execution worker identifier.'; end if;
 if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 300 then raise exception 'Invalid execution lease duration.'; end if;
 update public.engineering_execution_jobs
 set status='FAILED',error='Worker lease expired after the retry budget was exhausted.',error_code='WORKER_LEASE_EXPIRED',
     finished_at=clock_timestamp(),updated_at=clock_timestamp(),lease_owner=null,lease_token=null,lease_expires_at=null
 where status='RUNNING' and lease_expires_at<clock_timestamp() and attempts>=max_attempts;
 return query
 with candidate as (
  select j.id from public.engineering_execution_jobs as j
  where j.cancel_requested_at is null and (
   (j.status='QUEUED' and j.next_attempt_at<=clock_timestamp())
   or (j.status='RUNNING' and j.lease_expires_at<clock_timestamp() and j.attempts<j.max_attempts)
  )
  order by j.queued_at,j.created_at
  limit 1
  for update skip locked
 )
 update public.engineering_execution_jobs as j
 set status='RUNNING',attempts=j.attempts+1,lease_owner=p_worker_id,lease_token=gen_random_uuid(),
     lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
     started_at=coalesce(j.started_at,clock_timestamp()),updated_at=clock_timestamp()
 from candidate where j.id=candidate.id returning j.*;
end;
$$;
revoke all on function public.claim_engineering_execution_job(text,integer) from public,anon,authenticated;
grant execute on function public.claim_engineering_execution_job(text,integer) to service_role;
