import { isRecord } from "./agent-run-journal-codec.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface AgentActionIdentityContext {
  runId: string;
  expectedIndex: number;
}
interface ActionKeyContext {
  runId: string;
  index: number;
  hash: string;
}
function requireActionIndex(value: unknown): number {
  if (typeof value !== "number") throw new Error("Persisted agent action index is invalid.");
  if (!Number.isSafeInteger(value)) throw new Error("Persisted agent action index is invalid.");
  if (value < 0 || value >= 25) throw new Error("Persisted agent action index is invalid.");
  return value;
}
function requireActionHash(value: unknown): string {
  if (typeof value !== "string") throw new Error("Persisted agent action digest is invalid.");
  if (!SHA256_PATTERN.test(value)) throw new Error("Persisted agent action digest is invalid.");
  return value;
}
function requireActionKey(value: unknown, context: ActionKeyContext): void {
  const expected = "agent:" + context.runId + ":" + context.index + ":" + context.hash.slice(0, 32);
  if (value !== expected) throw new Error("Persisted agent action identity is inconsistent.");
}
function requireActionPayload(value: unknown): void {
  if (!isRecord(value)) throw new Error("Persisted agent action payload is invalid.");
}
export function validatePersistedActionIdentity(value: unknown, context: AgentActionIdentityContext): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Persisted agent action identity is invalid.");
  const index = requireActionIndex(value.actionIndex);
  if (index !== context.expectedIndex) throw new Error("Persisted agent action sequence is inconsistent.");
  const hash = requireActionHash(value.actionHash);
  requireActionKey(value.actionKey, { runId: context.runId, index, hash });
  requireActionPayload(value.action);
}
