import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentActionCheckpoint, AgentActionIdentity, AgentRunClaim, AgentRunRecord,
  BeginAgentActionState, CreateAgentRunInput
} from "./agent-run-journal-types.js";
import {
  buildAgentRunRow, isRecord, isUniqueViolation, rpcBoolean, rpcText, toAgentRunRecord
} from "./agent-run-journal-codec.js";

export * from "./agent-run-journal-types.js";
export { canonicalAgentRunDigest, createAgentActionIdentity } from "./agent-run-journal-codec.js";

const TABLE = "engineering_agent_runs";
const BEGIN_STATES: readonly BeginAgentActionState[] = [
  "STARTED", "IN_FLIGHT", "ALREADY_CHECKPOINTED", "NOT_CLAIMED", "NOT_FOUND"
];

export class AgentRunIdempotencyConflictError extends Error {
  constructor() {
    super("This agent-run Idempotency-Key was already used with a different request.");
    this.name = "AgentRunIdempotencyConflictError";
  }
}
export class AgentRunJournalError extends Error {
  constructor(operation: string) {
    super("Durable agent-run journal failed during " + operation + ".");
    this.name = "AgentRunJournalError";
  }
}
function readRun(input: { value: unknown; operation: string }): AgentRunRecord {
  try { return toAgentRunRecord(input.value); }
  catch { throw new AgentRunJournalError(input.operation); }
}
function beginState(value: unknown): BeginAgentActionState {
  const state = rpcText(value);
  if (BEGIN_STATES.includes(state as BeginAgentActionState)) return state as BeginAgentActionState;
  return "NOT_CLAIMED";
}
function createClaim(input: { row: unknown; workerId: string }): AgentRunClaim | undefined {
  if (!input.row) return undefined;
  const run = readRun({ value: input.row, operation: "validating a claimed run" });
  const leaseToken = isRecord(input.row) && typeof input.row.lease_token === "string" ? input.row.lease_token : "";
  if (!leaseToken || run.status !== "RUNNING") return undefined;
  return { run, workerId: input.workerId, leaseToken };
}

export class SupabaseAgentRunJournal {
  constructor(private readonly client: SupabaseClient) {}

  async createOrGet(input: CreateAgentRunInput): Promise<{ run: AgentRunRecord; created: boolean }> {
    const row = buildAgentRunRow(input);
    const inserted = await this.client.from(TABLE).insert(row).select("*").single();
    if (!inserted.error && inserted.data) {
      return { run: readRun({ value: inserted.data, operation: "validating a new run" }), created: true };
    }
    if (!isUniqueViolation(inserted.error)) throw new AgentRunJournalError("creating a run");
    return this.resolveIdempotentReplay(input, String(row.request_hash));
  }

  private async resolveIdempotentReplay(
    input: CreateAgentRunInput,
    requestHash: string
  ): Promise<{ run: AgentRunRecord; created: false }> {
    const existing = await this.client.from(TABLE).select("*")
      .eq("owner_id", input.ownerId).eq("project_id", input.projectId)
      .eq("idempotency_key", input.idempotencyKey).maybeSingle();
    if (existing.error || !existing.data) throw new AgentRunJournalError("resolving an idempotent run submission");
    if (existing.data.request_hash !== requestHash) throw new AgentRunIdempotencyConflictError();
    return { run: readRun({ value: existing.data, operation: "validating an idempotent run" }), created: false };
  }

  async getForProject(input: { runId: string; projectId: string }): Promise<AgentRunRecord | undefined> {
    const result = await this.client.from(TABLE).select("*")
      .eq("id", input.runId).eq("project_id", input.projectId).maybeSingle();
    if (result.error) throw new AgentRunJournalError("reading a run");
    if (!result.data) return undefined;
    return readRun({ value: result.data, operation: "validating a run read" });
  }

  async claim(input: { runId: string; workerId: string; leaseSeconds?: number }): Promise<AgentRunClaim | undefined> {
    const result = await this.client.rpc("claim_engineering_agent_run", {
      p_run_id: input.runId, p_worker_id: input.workerId, p_lease_seconds: input.leaseSeconds ?? 45
    });
    if (result.error) throw new AgentRunJournalError("claiming a run");
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return createClaim({ row, workerId: input.workerId });
  }

  async heartbeat(claim: AgentRunClaim, leaseSeconds = 45): Promise<{ active: boolean; cancelRequested: boolean }> {
    const result = await this.client.rpc("renew_engineering_agent_run", {
      p_run_id: claim.run.id, p_worker_id: claim.workerId,
      p_lease_token: claim.leaseToken, p_lease_seconds: leaseSeconds
    });
    if (result.error) throw new AgentRunJournalError("renewing a run lease");
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return {
      active: isRecord(row) && row.active === true,
      cancelRequested: isRecord(row) && row.cancel_requested === true
    };
  }

  async beginAction(claim: AgentRunClaim, identity: AgentActionIdentity): Promise<BeginAgentActionState> {
    const result = await this.client.rpc("begin_engineering_agent_action", {
      p_run_id: claim.run.id, p_worker_id: claim.workerId, p_lease_token: claim.leaseToken,
      p_action_index: identity.actionIndex, p_action_key: identity.actionKey,
      p_action_hash: identity.actionHash, p_action: identity.action
    });
    if (result.error) throw new AgentRunJournalError("persisting an action intent");
    return beginState(result.data);
  }

  async checkpointAction(claim: AgentRunClaim, checkpoint: AgentActionCheckpoint): Promise<boolean> {
    const result = await this.client.rpc("checkpoint_engineering_agent_action", {
      p_run_id: claim.run.id, p_worker_id: claim.workerId, p_lease_token: claim.leaseToken,
      p_action_index: checkpoint.identity.actionIndex, p_action_hash: checkpoint.identity.actionHash,
      p_outcome: checkpoint.outcome, p_graph_revision: checkpoint.graphRevision,
      p_next_status: checkpoint.nextStatus ?? "RUNNING", p_error: checkpoint.error ?? null
    });
    if (result.error) throw new AgentRunJournalError("checkpointing an action");
    return rpcBoolean(result.data);
  }

  async requestCancellation(input: { runId: string; projectId: string }): Promise<AgentRunRecord | undefined> {
    const result = await this.client.rpc("request_engineering_agent_run_cancellation", {
      p_run_id: input.runId, p_project_id: input.projectId
    });
    if (result.error) throw new AgentRunJournalError("requesting run cancellation");
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row) return undefined;
    return readRun({ value: row, operation: "validating a cancellation result" });
  }
}
