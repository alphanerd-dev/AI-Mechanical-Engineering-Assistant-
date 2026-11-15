import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261115120000_v2_0_31_agent_run_journal.sql"), "utf8").toLowerCase();

describe("V2.0.31 durable agent-run journal migration contract", () => {
  it("creates a separate project-scoped journal with bounded snapshots and append-only action history", () => {
    expect(sql).toContain("create table public.engineering_agent_runs");
    expect(sql).toContain("unique(owner_id, project_id, idempotency_key)");
    expect(sql).toContain("request_hash");
    expect(sql).toContain("plan_hash");
    expect(sql).toContain("action_history jsonb");
    expect(sql).toContain("current_action jsonb");
    expect(sql).toContain("next_action_index between 0 and 25");
  });

  it("keeps journal access server-only and fences all worker RPCs", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.engineering_agent_runs from public, anon, authenticated");
    expect(sql).toContain("grant select, insert on table public.engineering_agent_runs to service_role");
    expect(sql).toContain("claim_engineering_agent_run");
    expect(sql).toContain("renew_engineering_agent_run");
    expect(sql).toContain("lease_token");
    expect(sql).toContain("lease_expires_at > clock_timestamp()");
    expect(sql).toContain("if p_run_id is null or p_lease_token is null");
    expect(sql).toContain("if p_worker_id is null or length(trim(p_worker_id)) < 1");
    expect(sql).toContain("pg_column_size(p_action) > 32768");
    expect(sql).toContain("pg_column_size(p_outcome) > 65536");
    expect(sql).toContain("length(p_error) > 4000");
    expect(sql).not.toContain("return null;");
    expect(sql).not.toContain("create policy");
  });

  it("persists action intent before side effects and never auto-replays an ambiguous action", () => {
    expect(sql).toContain("begin_engineering_agent_action");
    expect(sql).toContain("checkpoint_engineering_agent_action");
    expect(sql).toContain("return 'already_checkpointed'");
    expect(sql).toContain("return 'in_flight'");
    expect(sql).toContain("reconciliation_required");
    expect(sql).toContain("worker lease expired while an action was in flight");
  });

  it("requires project-scoped cancellation and service-role-only function execution", () => {
    expect(sql).toContain("request_engineering_agent_run_cancellation");
    expect(sql).toContain("resume_engineering_agent_run_after_approval");
    expect(sql).toContain("approvalevidenceid");
    expect(sql).toContain("approval_grant");
    expect(sql).toContain("approval_evidence_required");
    expect(sql).toContain("approval.actor_subject = p_approved_by::text");
    expect(sql).toContain("stale_agent_graph");
    expect(sql).toContain("where id = p_run_id and project_id = p_project_id for update");
    expect(sql.match(/security definer set search_path = ''/g)?.length).toBe(6);
    expect(sql).not.toContain("grant execute on function public.claim_engineering_agent_run(uuid,text,integer) to authenticated");
  });
});
