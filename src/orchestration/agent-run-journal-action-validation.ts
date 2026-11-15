import { isRecord } from "./agent-run-journal-codec.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function requireActionIndex(value: unknown): number {
  if (typeof value !== "number") throw new Error("Persisted agent action index is invalid.");
  if (!Number.isSafeInteger(value)) throw new Error("Persisted agent action index is invalid.");
  if (value < 0 || value >= 25) throw new Error("Persisted agent action index is invalid.");
  return value;
}
function requireActionHash(value: unknown): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error("Persisted agent action digest is invalid.");
  }
  return value;
}
function requireActionKey(value: unknown, runId: string, index: number, hash: string): void {
  const expected = "agent:" + runId + ":" + index + ":" + hash.slice(0, 32);
  if (value !== expected) throw new Error("Persisted agent action identity is inconsistent.");
}
function requireActionPayload(value: unknown): void {
  if (!isRecord(value)) throw new Error("Persisted agent action payload is invalid.");
}
function requireTimestamp(value: unknown, label: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error("Persisted agent action " + label + " timestamp is invalid.");
  }
}
function validateActionIdentity(value: Record<string, unknown>, runId: string, expectedIndex: number): void {
  const index = requireActionIndex(value.actionIndex);
  if (index !== expectedIndex) throw new Error("Persisted agent action sequence is inconsistent.");
  const hash = requireActionHash(value.actionHash);
  requireActionKey(value.actionKey, runId, index, hash);
  requireActionPayload(value.action);
}
function validateActionHistoryEntry(value: unknown, runId: string, expectedIndex: number): void {
  if (!isRecord(value)) throw new Error("Persisted agent action history entry is invalid.");
  validateActionIdentity(value, runId, expectedIndex);
  requireActionPayload(value.outcome);
  if (typeof value.graphRevision !== "number" || !Number.isSafeInteger(value.graphRevision) || value.graphRevision < 1) {
    throw new Error("Persisted agent action graph revision is invalid.");
  }
  requireTimestamp(value.completedAt, "completion");
}
export function validatePersistedActionHistory(value: unknown, runId: string): number {
  if (!Array.isArray(value)) throw new Error("Persisted agent run payload history is invalid.");
  if (value.length > 25) throw new Error("Persisted agent run payload history is invalid.");
  value.forEach((entry, index) => validateActionHistoryEntry(entry, runId, index));
  return value.length;
}
export function validatePersistedCurrentAction(value: unknown, runId: string, nextActionIndex: number): void {
  if (value === null || value === undefined) return;
  if (!isRecord(value)) throw new Error("Persisted in-flight action is invalid.");
  validateActionIdentity(value, runId, nextActionIndex);
  requireTimestamp(value.startedAt, "start");
}
