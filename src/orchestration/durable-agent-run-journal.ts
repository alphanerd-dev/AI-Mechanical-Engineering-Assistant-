import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentRunJournalStatus =
  | "PLANNED" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED"
  | "FAILED" | "CANCELLED" | "RECONCILIATION_REQUIRED";
export type AgentActionCheckpointStatus = "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface AgentRunPlan {
  baseGraphRevision: number;
  actions: readonly unknown[];
}
export interface CreateAgentRunInput {
  runId: string;
  ownerId: string;
  projectId: string;
  idempotencyKey: string;
  initialGraphRevision: number;
  taskGraphSnapshot: Record<string, unknown>;
  limitsSnapshot: Record<string, unknown>;
  plan: AgentRunPlan;
}
export interface AgentRunRecord {
  id: string;
  ownerId: string;
  projectId: string;
  status: AgentRunJournalStatus;
  initialGraphRevision: number;
  currentGraphRevision: number;
  planHash: string;
  plan: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  actionHistory: Record<string, unknown>[];
  nextActionIndex: number;
  currentAction?: Record<string, unknown>;
  cancelRequestedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
export interface AgentRunClaim {
  run: AgentRunRecord;
  workerId: string;
  leaseToken: string;
}
export interface AgentActionIdentity {
  actionIndex: number;
  actionKey: string;
  actionHash: string;
  action: Record<string, unknown>;
}
export interface AgentActionCheckpoint {
  identity: AgentActionIdentity;
  outcome: Record<string, unknown>;
  graphRevision: number;
  nextStatus?: AgentActionCheckpointStatus;
  error?: string;
}
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

const TABLE = "engineering_agent_runs";
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assertJsonCompatible(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw new Error("Agent journal payload must contain finite JSON values only.");
  if (seen.has(value)) throw new Error("Agent journal payload cannot contain circular references.");
  seen.add(value);
  if (Array.isArray(value)) value.forEach(item => assertJsonCompatible(item, seen));
  else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Agent journal payload must use plain JSON objects.");
    if (Object.getOwnPropertySymbols(value).length) throw new Error("Agent journal payload cannot contain symbol keys.");
    Object.values(value as Record<string, unknown>).forEach(item => assertJsonCompatible(item, seen));
  }
  seen.delete(value);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export function canonicalAgentRunDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function createAgentActionIdentity(runId: string, actionIndex: number, action: Record<string, unknown>): AgentActionIdentity {
  if (!runId.trim() || !Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= 25) {
    throw new Error("Agent action identity requires a run ID and an index from 0 to 24.");
  }
  const actionHash = canonicalAgentRunDigest(action);
  return {
    actionIndex,
    actionHash,
    actionKey: "agent:" + runId + ":" + actionIndex + ":" + actionHash.slice(0, 32),
    action
  };
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function toRun(value: unknown): AgentRunRecord {
  const row = isRecord(value) ? value : undefined;
  const status = row?.status;
  const statuses: readonly string[] = ["PLANNED","RUNNING","WAITING_APPROVAL","COMPLETED","FAILED","CANCELLED","RECONCILIATION_REQUIRED"];
  if (!row || typeof row.id !== "string" || typeof row.owner_id !== "string" ||
      typeof row.project_id !== "string" || typeof status !== "string" || !statuses.includes(status) ||
      !isRecord(row.plan) || !isRecord(row.checkpoint) || !Array.isArray(row.action_history)) {
    throw new AgentRunJournalError("validating a persisted run");
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id,
    status: status as AgentRunJournalStatus,
    initialGraphRevision: asNumber(row.initial_graph_revision) ?? 0,
    currentGraphRevision: asNumber(row.current_graph_revision) ?? 0,
    planHash: asString(row.plan_hash) ?? "",
    plan: row.plan,
    checkpoint: row.checkpoint,
    actionHistory: row.action_history.filter(isRecord),
    nextActionIndex: asNumber(row.next_action_index) ?? 0,
    ...(isRecord(row.current_action) ? { currentAction: row.current_action } : {}),
    ...(asString(row.cancel_requested_at) ? { cancelRequestedAt: asString(row.cancel_requested_at) } : {}),
    ...(asString(row.error) ? { error: asString(row.error) } : {}),
    createdAt: asString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: asString(row.updated_at) ?? new Date(0).toISOString()
  };
}
function rpcBoolean(data: unknown): boolean {
  if (typeof data === "boolean") return data;
  if (Array.isArray(data) && typeof data[0] === "boolean") return data[0];
  return false;
}

export class SupabaseAgentRunJournal {
  constructor(private readonly client: SupabaseClient) {}

  async createOrGet(input: CreateAgentRunInput): Promise<{ run: AgentRunRecord; created: boolean }> {
    if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw new Error("Agent run idempotency key is invalid.");
    if (!Number.isInteger(input.initialGraphRevision) || input.initialGraphRevision < 1) throw new Error("Initial graph revision is invalid.");
    if (input.plan.baseGraphRevision !== input.initialGraphRevision || input.plan.actions.length < 1 || input.plan.actions.length > 25) {
      throw new Error("Agent plan revision or bounded action count is invalid.");
    }
    const plan = {
      taskGraphSnapshot: input.taskGraphSnapshot,
      limitsSnapshot: input.limitsSnapshot,
      proposal: input.plan
    };
    const requestHash = canonicalAgentRunDigest({
      projectId: input.projectId,
      initialGraphRevision: input.initialGraphRevision,
      taskGraphSnapshot: input.taskGraphSnapshot,
      limitsSnapshot: input.limitsSnapshot,
      plan
    });
    const planHash = canonicalAgentRunDigest(plan);
    if (!SHA256_PATTERN.test(requestHash) || !SHA256_PATTERN.test(planHash)) throw new AgentRunJournalError("hashing a run request");
    const row = {
      id: input.runId,
      owner_id: input.ownerId,
      project_id: input.projectId,
      idempotency_key: input.idempotencyKey,
      request_hash: requestHash,
      plan_hash: planHash,
      initial_graph_revision: input.initialGraphRevision,
      current_graph_revision: input.initialGraphRevision,
      status: "PLANNED",
      plan,
      checkpoint: {},
      action_history: [],
      next_action_index: 0
    };
    const inserted = await this.client.from(TABLE).insert(row).select("*").single();
    if (!inserted.error && inserted.data) return { run: toRun(inserted.data), created: true };
    if (isRecord(inserted.error) && inserted.error.code === "23505") {
      const existing = await this.client.from(TABLE).select("*")
        .eq("owner_id", input.ownerId).eq("project_id", input.projectId)
        .eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (existing.error || !existing.data) throw new AgentRunJournalError("resolving an idempotent run submission");
      if (existing.data.request_hash !== requestHash) throw new AgentRunIdempotencyConflictError();
      return { run: toRun(existing.data), created: false };
    }
    throw new AgentRunJournalError("creating a run");
  }

  async getForProject(runId: string, projectId: string): Promise<AgentRunRecord | undefined> {
    const result = await this.client.from(TABLE).select("*").eq("id", runId).eq("project_id", projectId).maybeSingle();
    if (result.error) throw new AgentRunJournalError("reading a run");
    return result.data ? toRun(result.data) : undefined;
  }

  async claim(runId: string, workerId: string, leaseSeconds = 45): Promise<AgentRunClaim | undefined> {
    const result = await this.client.rpc("claim_engineering_agent_run", {
      p_run_id: runId, p_worker_id: workerId, p_lease_seconds: leaseSeconds
    });
    if (result.error) throw new AgentRunJournalError("claiming a run");
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row) return undefined;
    const claim = toRun(row);
    const leaseToken = asString(isRecord(row) ? row.lease_token : undefined);
    if (!leaseToken || claim.status !== "RUNNING") return undefined;
    return { run: claim, workerId, leaseToken };
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

  async beginAction(claim: AgentRunClaim, identity: AgentActionIdentity): Promise<"STARTED" | "IN_FLIGHT" | "ALREADY_CHECKPOINTED" | "NOT_CLAIMED" | "NOT_FOUND"> {
    const result = await this.client.rpc("begin_engineering_agent_action", {
      p_run_id: claim.run.id,
      p_worker_id: claim.workerId,
      p_lease_token: claim.leaseToken,
      p_action_index: identity.actionIndex,
      p_action_key: identity.actionKey,
      p_action_hash: identity.actionHash,
      p_action: identity.action
    });
    if (result.error) throw new AgentRunJournalError("persisting an action intent");
    return rpcBoolean(result.data);
  }

  async checkpointAction(claim: AgentRunClaim, checkpoint: AgentActionCheckpoint): Promise<boolean> {
    const result = await this.client.rpc("checkpoint_engineering_agent_action", {
      p_run_id: claim.run.id,
      p_worker_id: claim.workerId,
      p_lease_token: claim.leaseToken,
      p_action_index: checkpoint.identity.actionIndex,
      p_action_hash: checkpoint.identity.actionHash,
      p_outcome: checkpoint.outcome,
      p_graph_revision: checkpoint.graphRevision,
      p_next_status: checkpoint.nextStatus ?? "RUNNING",
      p_error: checkpoint.error ?? null
    });
    if (result.error) throw new AgentRunJournalError("checkpointing an action");
    return rpcBoolean(result.data);
  }

  async requestCancellation(runId: string, projectId: string): Promise<AgentRunRecord | undefined> {
    const result = await this.client.rpc("request_engineering_agent_run_cancellation", {
      p_run_id: runId, p_project_id: projectId
    });
    if (result.error) throw new AgentRunJournalError("requesting run cancellation");
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return row ? toRun(row) : undefined;
  }
}
