import { createHash } from "node:crypto";
import type {
  AgentActionIdentity, AgentRunJournalStatus, CreateAgentRunInput, AgentRunRecord
} from "./agent-run-journal-types.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RUN_STATUSES: readonly AgentRunJournalStatus[] = [
  "PLANNED", "RUNNING", "WAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "RECONCILIATION_REQUIRED"
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isJsonPrimitive(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return false;
}
function assertJsonArray(value: unknown[], seen: Set<object>): void {
  if (Object.keys(value).length !== value.length) throw new Error("Agent journal arrays must be dense JSON arrays.");
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("Agent journal arrays cannot contain symbol keys.");
  for (const item of value) assertJsonCompatible(item, seen);
}
function assertJsonObject(value: object, seen: Set<object>): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("Agent journal payload must use plain JSON objects.");
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("Agent journal payload cannot contain symbol keys.");
  for (const item of Object.values(value as Record<string, unknown>)) assertJsonCompatible(item, seen);
}
function assertJsonCompatible(value: unknown, seen = new Set<object>()): void {
  if (isJsonPrimitive(value)) return;
  if (value === null || typeof value !== "object") throw new Error("Agent journal payload must contain finite JSON values only.");
  if (seen.has(value)) throw new Error("Agent journal payload cannot contain circular references.");
  seen.add(value);
  if (Array.isArray(value)) assertJsonArray(value, seen);
  else assertJsonObject(value, seen);
  seen.delete(value);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export function canonicalAgentRunDigest(value: unknown): string {
  assertJsonCompatible(value);
  const serialized = JSON.stringify(canonical(value));
  if (typeof serialized !== "string") throw new Error("Agent journal payload could not be serialized.");
  return createHash("sha256").update(serialized).digest("hex");
}
function validateActionIndex(actionIndex: number): void {
  if (!Number.isInteger(actionIndex)) throw new Error("Agent action index must be an integer.");
  if (actionIndex < 0 || actionIndex >= 25) throw new Error("Agent action index must be from 0 to 24.");
}
export function createAgentActionIdentity(runId: string, actionIndex: number, action: Record<string, unknown>): AgentActionIdentity {
  if (!runId.trim()) throw new Error("Agent action identity requires a run ID.");
  validateActionIndex(actionIndex);
  const actionHash = canonicalAgentRunDigest(action);
  return { actionIndex, actionHash, actionKey: "agent:" + runId + ":" + actionIndex + ":" + actionHash.slice(0, 32), action };
}
function validateIdempotencyKey(key: string): void {
  if (!IDEMPOTENCY_PATTERN.test(key)) throw new Error("Agent run idempotency key is invalid.");
}
function validateInitialRevision(revision: number): void {
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Initial graph revision is invalid.");
}
function validatePlanRevision(planRevision: number, graphRevision: number): void {
  if (planRevision !== graphRevision) throw new Error("Agent plan base revision does not match the graph snapshot.");
}
function validatePlanActionCount(actions: readonly unknown[]): void {
  if (actions.length < 1 || actions.length > 25) throw new Error("Agent plan must contain from 1 to 25 actions.");
}
function createPlanSnapshot(input: CreateAgentRunInput): Record<string, unknown> {
  return {
    taskGraphSnapshot: input.taskGraphSnapshot,
    limitsSnapshot: input.limitsSnapshot,
    proposal: input.plan
  };
}
function createRunHashes(input: CreateAgentRunInput, plan: Record<string, unknown>): { requestHash: string; planHash: string } {
  const requestHash = canonicalAgentRunDigest({
    projectId: input.projectId,
    initialGraphRevision: input.initialGraphRevision,
    taskGraphSnapshot: input.taskGraphSnapshot,
    limitsSnapshot: input.limitsSnapshot,
    plan
  });
  const planHash = canonicalAgentRunDigest(plan);
  if (!SHA256_PATTERN.test(requestHash) || !SHA256_PATTERN.test(planHash)) {
    throw new Error("Agent run hashes are invalid.");
  }
  return { requestHash, planHash };
}
export function buildAgentRunRow(input: CreateAgentRunInput): Record<string, unknown> {
  validateIdempotencyKey(input.idempotencyKey);
  validateInitialRevision(input.initialGraphRevision);
  validatePlanRevision(input.plan.baseGraphRevision, input.initialGraphRevision);
  validatePlanActionCount(input.plan.actions);
  const plan = createPlanSnapshot(input);
  const hashes = createRunHashes(input, plan);
  return {
    id: input.runId,
    owner_id: input.ownerId,
    project_id: input.projectId,
    idempotency_key: input.idempotencyKey,
    request_hash: hashes.requestHash,
    plan_hash: hashes.planHash,
    initial_graph_revision: input.initialGraphRevision,
    current_graph_revision: input.initialGraphRevision,
    status: "PLANNED",
    plan,
    checkpoint: {},
    action_history: [],
    next_action_index: 0
  };
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function hasRunIdentity(row: Record<string, unknown>): boolean {
  if (typeof row.id !== "string") return false;
  if (typeof row.owner_id !== "string") return false;
  return typeof row.project_id === "string";
}
function hasRunPayload(row: Record<string, unknown>): boolean {
  if (!isRecord(row.plan) || !isRecord(row.checkpoint)) return false;
  return Array.isArray(row.action_history);
}
function parseRunStatus(value: unknown): AgentRunJournalStatus | undefined {
  if (typeof value !== "string") return undefined;
  return RUN_STATUSES.includes(value as AgentRunJournalStatus) ? value as AgentRunJournalStatus : undefined;
}
function requireRunRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Persisted agent run is not an object.");
  if (!hasRunIdentity(value)) throw new Error("Persisted agent run identity is invalid.");
  if (!hasRunPayload(value)) throw new Error("Persisted agent run payload is invalid.");
  return value;
}
function requireRunStatus(value: unknown): AgentRunJournalStatus {
  const status = parseRunStatus(value);
  if (!status) throw new Error("Persisted agent run status is invalid.");
  return status;
}
function mapRunIdentity(row: Record<string, unknown>) {
  return { id: row.id as string, ownerId: row.owner_id as string, projectId: row.project_id as string };
}
function mapRunProgress(row: Record<string, unknown>) {
  return {
    status: requireRunStatus(row.status),
    initialGraphRevision: asNumber(row.initial_graph_revision) ?? 0,
    currentGraphRevision: asNumber(row.current_graph_revision) ?? 0,
    nextActionIndex: asNumber(row.next_action_index) ?? 0
  };
}
function mapRunPayload(row: Record<string, unknown>) {
  return {
    planHash: asString(row.plan_hash) ?? "",
    plan: row.plan as Record<string, unknown>,
    checkpoint: row.checkpoint as Record<string, unknown>,
    actionHistory: (row.action_history as unknown[]).filter(isRecord)
  };
}
function mapOptionalRunFields(row: Record<string, unknown>): Pick<AgentRunRecord, "currentAction" | "cancelRequestedAt" | "error"> {
  const optional: Pick<AgentRunRecord, "currentAction" | "cancelRequestedAt" | "error"> = {};
  if (isRecord(row.current_action)) optional.currentAction = row.current_action;
  const cancelRequestedAt = asString(row.cancel_requested_at);
  if (cancelRequestedAt) optional.cancelRequestedAt = cancelRequestedAt;
  const error = asString(row.error);
  if (error) optional.error = error;
  return optional;
}
function mapRunTimestamps(row: Record<string, unknown>) {
  return {
    createdAt: asString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: asString(row.updated_at) ?? new Date(0).toISOString()
  };
}
export function toAgentRunRecord(value: unknown): AgentRunRecord {
  const row = requireRunRecord(value);
  return {
    ...mapRunIdentity(row),
    ...mapRunProgress(row),
    ...mapRunPayload(row),
    ...mapOptionalRunFields(row),
    ...mapRunTimestamps(row)
  };
}
export function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}
export function rpcBoolean(data: unknown): boolean {
  if (typeof data === "boolean") return data;
  if (Array.isArray(data) && typeof data[0] === "boolean") return data[0];
  return false;
}
export function rpcText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  return "NOT_CLAIMED";
}
