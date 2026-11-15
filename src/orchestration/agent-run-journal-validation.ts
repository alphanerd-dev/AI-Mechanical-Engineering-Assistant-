import type { AgentRunRecord, CreateAgentRunInput } from "./agent-run-journal-types.js";
import { buildAgentRunRow, isRecord, toAgentRunRecord } from "./agent-run-journal-codec.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
function validateRunIdentifiers(input: CreateAgentRunInput): void {
  if (!isUuid(input.runId)) throw new Error("Agent run ID must be a UUID.");
  if (!isUuid(input.ownerId)) throw new Error("Agent run owner ID must be a UUID.");
  if (!isUuid(input.projectId)) throw new Error("Agent run project ID must be a UUID.");
}
function validateInitialRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Initial graph revision is invalid.");
  }
}
function validatePlanActions(actions: readonly unknown[]): void {
  if (!Array.isArray(actions)) throw new Error("Agent plan actions must be an array.");
  if (actions.length < 1 || actions.length > 25) {
    throw new Error("Agent plan must contain from 1 to 25 actions.");
  }
}
export function buildValidatedAgentRunRow(input: CreateAgentRunInput): Record<string, unknown> {
  validateRunIdentifiers(input);
  validateInitialRevision(input.initialGraphRevision);
  validatePlanActions(input.plan.actions);
  return buildAgentRunRow(input);
}

function requireRunRow(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Persisted agent run is not an object.");
  return value;
}
function validateRunIdentity(row: Record<string, unknown>): void {
  if (!isUuid(row.id) || !isUuid(row.owner_id) || !isUuid(row.project_id)) {
    throw new Error("Persisted agent run identity is invalid.");
  }
}
function validateRunPayload(row: Record<string, unknown>): void {
  if (!isRecord(row.plan) || !isRecord(row.checkpoint)) {
    throw new Error("Persisted agent run payload is invalid.");
  }
  if (!Array.isArray(row.action_history) || row.action_history.length > 25) {
    throw new Error("Persisted agent run payload history is invalid.");
  }
  if (!row.action_history.every(isRecord)) {
    throw new Error("Persisted agent run payload history is invalid.");
  }
}
function requireSafeRevision(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Persisted " + label + " graph revision is invalid.");
  }
  return value;
}
function validateGraphRevisions(row: Record<string, unknown>): void {
  const initial = requireSafeRevision(row.initial_graph_revision, "initial");
  const current = requireSafeRevision(row.current_graph_revision, "current");
  if (current < initial) throw new Error("Persisted current graph revision is invalid.");
}
function validateNextActionIndex(row: Record<string, unknown>): void {
  const index = row.next_action_index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 25) {
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
function validateOptionalFields(row: Record<string, unknown>): void {
  const currentAction = row.current_action;
  if (currentAction !== null && currentAction !== undefined && !isRecord(currentAction)) {
    throw new Error("Persisted in-flight action is invalid.");
  }
  const cancelRequestedAt = row.cancel_requested_at;
  if (cancelRequestedAt !== null && cancelRequestedAt !== undefined && typeof cancelRequestedAt !== "string") {
    throw new Error("Persisted cancellation timestamp is invalid.");
  }
  const error = row.error;
  if (error !== null && error !== undefined && typeof error !== "string") {
    throw new Error("Persisted run error is invalid.");
  }
}
function validatePersistedTimestamps(row: Record<string, unknown>): void {
  if (typeof row.created_at !== "string" || Number.isNaN(Date.parse(row.created_at))) {
    throw new Error("Persisted creation timestamp is invalid.");
  }
  if (typeof row.updated_at !== "string" || Number.isNaN(Date.parse(row.updated_at))) {
    throw new Error("Persisted update timestamp is invalid.");
  }
}
function validatePersistedRun(row: Record<string, unknown>): void {
  validateRunIdentity(row);
  validateRunPayload(row);
  validateGraphRevisions(row);
  validateNextActionIndex(row);
  validatePersistedHashes(row);
  validateOptionalFields(row);
  validatePersistedTimestamps(row);
}
export function toValidatedAgentRunRecord(value: unknown): AgentRunRecord {
  const row = requireRunRow(value);
  validatePersistedRun(row);
  return toAgentRunRecord(row);
}
