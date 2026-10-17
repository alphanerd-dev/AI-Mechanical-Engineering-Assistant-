-- V2.0.30: renew worker leases using the database clock and fencing token.
-- Do not apply to production until the existing remote migration-history drift is reconciled.
create or replace function public.renew_engineering_execution_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 45
)
returns table(active boolean, cancel_requested boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancel_requested boolean;
begin
  if p_job_id is null or p_lease_token is null then
    raise exception 'Execution job ID and lease token are required.';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) < 1 or length(p_worker_id) > 128 then
    raise exception 'Invalid execution worker identifier.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception 'Invalid execution lease duration.';
  end if;

  update public.engineering_execution_jobs as j
     set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
         updated_at = clock_timestamp()
   where j.id = p_job_id
     and j.status = 'RUNNING'
     and j.lease_owner = p_worker_id
     and j.lease_token = p_lease_token
     -- An expired lease cannot be resurrected by a slow/stale process.
     and j.lease_expires_at > clock_timestamp()
   returning j.cancel_requested_at is not null into v_cancel_requested;

  if found then
    return query select true, v_cancel_requested;
  else
    return query select false, false;
  end if;
end;
$$;

revoke all on function public.renew_engineering_execution_job(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.renew_engineering_execution_job(uuid, text, uuid, integer) to service_role;
