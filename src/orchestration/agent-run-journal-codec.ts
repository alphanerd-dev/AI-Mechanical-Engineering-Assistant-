import { createHash } from "node:crypto";
import type { AgentActionIdentity, AgentRunJournalStatus, CreateAgentRunInput, AgentRunRecord } from "./agent-run-journal-types.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  if (actionIndex < 0) throw new Error("Agent action index cannot be negative.");
  if (actionIndex >= 25) throw new Error("Agent action index must be less than 25.");
}
export function createAgentActionIdentity(runId: string, actionIndex: number, action: Record<string, unknown>): AgentActionIdentity {
  if (!runId.trim()) throw new Error("Agent action identity requires a run ID.");
  validateActionIndex(actionIndex);
  const actionHash = canonicalAgentRunDigest(action);
  return { actionIndex, actionHash, actionKey: "agent:" + runId + ":" + actionIndex + ":" + actionHash.slice(0, 32), action };
}
function validateRunIdentifiers(input: CreateAgentRunInput): void {
  if (!UUID_PATTERN.test(input.runId)) throw new Error("Agent run ID must be a UUID.");
  if (!UUID_PATTERN.test(input.ownerId)) throw new Error("Agent run owner ID must be a UUID.");
  if (!UUID_PATTERN.test(input.projectId)) throw new Error("Agent run project ID must be a UUID.");
}
function validateIdempotencyKey(key: string): void {
  if (!IDEMPOTENCY_PATTERN.test(key)) throw new Error("Agent run idempotency key is invalid.");
}
function validateInitialRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Initial graph revision is invalid.");
}
function validatePlanRevision(planRevision: number, graphRevision: number): void {
  if (planRevision !== graphRevision) throw new Error("Agent plan base revision does not match the graph snapshot.");
}
function validatePlanActionCount(actions: readonly unknown[]): void {
  if (!Array.isArray(actions)) throw new Error("Agent plan actions must be an array.");
  if (actions.length < 1 || actions.length > 25) throw new Error("Agent plan must contain from 1 to 25 actions.");
}
function createPlanSnapshot(input: CreateAgentRunInput): Record<string, unknown> {
  return { taskGraphSnapshot: input.taskGraphSnapshot, limitsSnapshot: input.limitsSnapshot, proposal: input.plan };
}
function createRunHashes(input: CreateAgentRunInput, plan: Record<string, unknown>): { requestHash: string; planHash: string } {
  const requestHash = canonicalAgentRunDigest({
    projectId: input.projectId, initialGraphRevision: input.initialGraphRevision,
    taskGraphSnapshot: input.taskGraphSnapshot, limitsSnapshot: input.limitsSnapshot, plan
  });
  const planHash = canonicalAgentRunDigest(plan);
  if (!SHA256_PATTERN.test(requestHash) || !SHA256_PATTERN.test(planHash)) throw new Error("Agent run hashes are invalid.");
  return { requestHash, planHash };
}
export function buildAgentRunRow(input: CreateAgentRunInput): Record<string, unknown> {
  validateRunIdentifiers(input);
  validateIdempotencyKey(input.idempotencyKey);
  validateInitialRevision(input.initialGraphRevision);
  validatePlanRevision(input.plan.baseGraphRevision, input.initialGraphRevision);
  validatePlanActionCount(input.plan.actions);
  const plan = createPlanSnapshot(input);
  const hashes = createRunHashes(input, plan);
  return {
    id: input.runId, owner_id: input.ownerId, project_id: input.projectId,
    idempotency_key: input.idempotencyKey, request_hash: hashes.requestHash, plan_hash: hashes.planHash,
    initial_graph_revision: input.initialGraphRevision, current_graph_revision: input.initialGraphRevision,
    status: "PLANNED", plan, checkpoint: {}, action_history: [], next_action_index: 0
  };
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function hasRunIdentity(row: Record<string, unknown>): boolean {
  if (typeof row.id !== "string" || !UUID_PATTERN.test(row.id)) return false;
  if (typeof row.owner_id !== "string" || !UUID_PATTERN.test(row.owner_id)) return false;
  return typeof row.project_id === "string" && UUID_PATTERN.test(row.project_id);
}
function hasRunPayload(row: Record<string, unknown>): boolean {
  if (!isRecord(row.plan) || !isRecord(row.checkpoint)) return false;
  if (!Array.isArray(row.action_history) || row.action_history.length > 25) return false;
  return row.action_history.every(isRecord);
}
function requireInitialGraphRevision(row: Record<string, unknown>): number {
  const revision = asNumber(row.initial_graph_revision);
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) {
    throw new Error("Persisted initial graph revision is invalid.");
  }
  return revision as number;
}
function validateCurrentGraphRevision(row: Record<string, unknown>, initialRevision: number): void {
  const revision = asNumber(row.current_graph_revision);
  if (!Number.isSafeInteger(revision) || (revision as number) < initialRevision) {
    throw new Error("Persisted current graph revision is invalid.");
  }
}
function validateNextActionIndex(row: Record<string, unknown>): void {
  const index = asNumber(row.next_action_index);
  if (!Number.isInteger(index) || (index as number) < 0 || (index as number) > 25) {
    throw new Error("Persisted next action index is invalid.");
  }
}
function validatePersistedHashes(row: Record<string, unknown>): void {
  if (typeof row.plan_hash !== "string" || !SHA256_PATTERN.test(row.plan_hash)) {
    throw new Error("Persisted plan hash is invalid.");
  }
  if (typeof row.request_hash !== "string" || !SHA256_PATTERN.test(row.request_hash)) {
    throw new Error("Persisted request hash is invalid.");
  }
}
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}
function isValidOptionalAction(value: unknown): boolean {
  return isAbsent(value) || isRecord(value);
}
function isValidOptionalString(value: unknown): boolean {
  return isAbsent(value) || typeof value === "string";
}
function assertOptionalField(input: { valid: boolean; message: string }): void {
  if (!input.valid) throw new Error(input.message);
}
function validatePersistedOptionalFields(row: Record<string, unknown>): void {
  assertOptionalField({
    valid: isValidOptionalAction(row.current_action),
    message: "Persisted in-flight action is invalid."
  });
  assertOptionalField({
    valid: isValidOptionalString(row.cancel_requested_at),
    message: "Persisted cancellation timestamp is invalid."
  });
  assertOptionalField({
    valid: isValidOptionalString(row.error),
    message: "Persisted run error is invalid."
  });
}

function validatePersistedTimestamps(row: Record<string, unknown>): void {
  if (typeof row.created_at !== "string" || Number.isNaN(Date.parse(row.created_at))) {
    throw new Error("Persisted creation timestamp is invalid.");
  }
  if (typeof row.updated_at !== "string" || Number.isNaN(Date.parse(row.updated_at))) {
    throw new Error("Persisted update timestamp is invalid.");
  }
}
function validateRunCounters(row: Record<string, unknown>): void {
  const initialRevision = requireInitialGraphRevision(row);
  validateCurrentGraphRevision(row, initialRevision);
  validateNextActionIndex(row);
  validatePersistedHashes(row);
  validatePersistedOptionalFields(row);
  validatePersistedTimestamps(row);
}

function parseRunStatus(value: unknown): AgentRunJournalStatus | undefined {
  if (typeof value !== "string") return undefined;
  return RUN_STATUSES.includes(value as AgentRunJournalStatus) ? value as AgentRunJournalStatus : undefined;
}
function optionalRunFields(row: Record<string, unknown>): Partial<AgentRunRecord> {
  const fields: Partial<AgentRunRecord> = {};
  if (isRecord(row.current_action)) fields.currentAction = row.current_action;
  if (asString(row.cancel_requested_at)) fields.cancelRequestedAt = asString(row.cancel_requested_at);
  if (asString(row.error)) fields.error = asString(row.error);
  return fields;
}
function requireRunRow(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Persisted agent run is not an object.");
  return value;
}
function validateRunIdentityAndPayload(row: Record<string, unknown>): void {
  if (!hasRunIdentity(row)) throw new Error("Persisted agent run identity is invalid.");
  if (!hasRunPayload(row)) throw new Error("Persisted agent run payload is invalid.");
}
function requireRunStatus(row: Record<string, unknown>): AgentRunJournalStatus {
  const status = parseRunStatus(row.status);
  if (!status) throw new Error("Persisted agent run status is invalid.");
  return status;
}
function validateRunRecord(value: unknown): { row: Record<string, unknown>; status: AgentRunJournalStatus } {
  const row = requireRunRow(value);
  validateRunIdentityAndPayload(row);
  const status = requireRunStatus(row);
  validateRunCounters(row);
  return { row, status };
}
function buildRunRecord(row: Record<string, unknown>, status: AgentRunJournalStatus): AgentRunRecord {
  return {
    id: row.id as string, ownerId: row.owner_id as string, projectId: row.project_id as string,
    status, initialGraphRevision: asNumber(row.initial_graph_revision) as number,
    currentGraphRevision: asNumber(row.current_graph_revision) as number,
    planHash: asString(row.plan_hash) ?? "", plan: row.plan as Record<string, unknown>,
    checkpoint: row.checkpoint as Record<string, unknown>,
    actionHistory: row.action_history as Record<string, unknown>[],
    nextActionIndex: asNumber(row.next_action_index) as number,
    ...optionalRunFields(row),
    createdAt: asString(row.created_at) as string,
    updatedAt: asString(row.updated_at) as string
  };
}
export function toAgentRunRecord(value: unknown): AgentRunRecord {
  const validated = validateRunRecord(value);
  return buildRunRecord(validated.row, validated.status);
}
export function isUniqueViolation(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === "23505";
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
