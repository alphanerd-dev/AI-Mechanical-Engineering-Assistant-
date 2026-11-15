import {
  validatePersistedActionIdentity, type AgentActionIdentityContext
} from "./agent-run-journal-action-identity.js";

interface ActionTimestampContext {
  field: "start" | "completion";
}
interface ActionRunContext {
  runId: string;
}
interface CurrentActionContext extends ActionRunContext {
  nextActionIndex: number;
}
function requireActionTimestamp(value: unknown, context: ActionTimestampContext): void {
  if (typeof value !== "string") throw new Error("Persisted agent action " + context.field + " timestamp is invalid.");
  if (Number.isNaN(Date.parse(value))) throw new Error("Persisted agent action " + context.field + " timestamp is invalid.");
}
function requireActionGraphRevision(value: unknown): void {
  if (typeof value !== "number") throw new Error("Persisted agent action graph revision is invalid.");
  if (!Number.isSafeInteger(value)) throw new Error("Persisted agent action graph revision is invalid.");
  if (value < 1) throw new Error("Persisted agent action graph revision is invalid.");
}
function validateActionHistoryEntry(value: unknown, context: AgentActionIdentityContext): void {
  validatePersistedActionIdentity(value, context);
  requireActionGraphRevision(value.graphRevision);
  requireActionTimestamp(value.completedAt, { field: "completion" });
}
export function validatePersistedActionHistory(value: unknown, context: ActionRunContext): number {
  if (!Array.isArray(value)) throw new Error("Persisted agent run payload history is invalid.");
  if (value.length > 25) throw new Error("Persisted agent run payload history is invalid.");
  value.forEach((entry, expectedIndex) => validateActionHistoryEntry(entry, {
    runId: context.runId, expectedIndex
  }));
  return value.length;
}
export function validatePersistedCurrentAction(value: unknown, context: CurrentActionContext): void {
  if (value === null || value === undefined) return;
  validatePersistedActionIdentity(value, { runId: context.runId, expectedIndex: context.nextActionIndex });
  requireActionTimestamp(value.startedAt, { field: "start" });
}
