-- V2.0.33: compare the audit event's text project_id with the UUID run scope safely.
-- engineering_audit_events.project_id is text in the existing audit schema.
create or replace function public.resume_engineering_agent_run_after_approval(
  p_run_id uuid,
  p_project_id uuid,
  p_approved_by uuid,
  p_approval_evidence_id uuid,
  p_graph_revision bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.engineering_agent_runs%rowtype;
begin
  if p_approved_by is null or p_approval_evidence_id is null then
    raise exception 'Authenticated approver and approval evidence ID are required.';
  end if;
  if not exists (select 1 from auth.users where id = p_approved_by) then
    raise exception 'Approver identity does not exist.';
  end if;

  select * into v_run
    from public.engineering_agent_runs
   where id = p_run_id and project_id = p_project_id
   for update;
  if not found then return false; end if;
  if v_run.status <> 'WAITING_APPROVAL' or v_run.current_action is not null
     or v_run.cancel_requested_at is not null then return false; end if;
  if p_graph_revision is distinct from v_run.current_graph_revision then
    raise exception 'STALE_AGENT_GRAPH: task graph changed while awaiting human approval.';
  end if;

  if not exists (
    select 1
      from public.engineering_audit_events as approval
     where approval.event_id = p_approval_evidence_id
       and approval.project_id = p_project_id::text
       and approval.resource_type = 'AGENT_RUN'
       and approval.resource_id = p_run_id::text
       and approval.run_id = p_run_id::text
       and approval.action = 'APPROVAL_GRANT'
       and approval.outcome = 'SUCCESS'
       and approval.actor_type = 'USER'
       and approval.actor_subject = p_approved_by::text
       and approval.metadata->>'decision' = 'APPROVED'
       and approval.metadata->>'planHash' = v_run.plan_hash
       and approval.metadata->>'actionIndex' = (v_run.next_action_index - 1)::text
  ) then
    raise exception 'APPROVAL_EVIDENCE_REQUIRED: a durable user approval audit event is required.';
  end if;

  update public.engineering_agent_runs
     set status = 'PLANNED',
         checkpoint = checkpoint || jsonb_build_object(
           'humanApproval', jsonb_build_object(
             'approvedBy', p_approved_by,
             'approvalEvidenceId', p_approval_evidence_id,
             'graphRevision', p_graph_revision,
             'approvedAt', clock_timestamp()
           )
         ),
         error = null,
         finished_at = null,
         updated_at = clock_timestamp()
   where id = p_run_id;
  return true;
end;
$function$;

revoke all on function public.resume_engineering_agent_run_after_approval(uuid,uuid,uuid,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.resume_engineering_agent_run_after_approval(uuid,uuid,uuid,uuid,bigint)
  to service_role;
