export type AgentRunJournalStatus =
  | "PLANNED" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED"
  | "FAILED" | "CANCELLED" | "RECONCILIATION_REQUIRED";
export type AgentActionCheckpointStatus = "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
export interface AgentRunPlan { baseGraphRevision: number; actions: readonly unknown[]; }
export interface CreateAgentRunInput {
  runId: string; ownerId: string; projectId: string; idempotencyKey: string;
  initialGraphRevision: number; taskGraphSnapshot: Record<string, unknown>;
  limitsSnapshot: Record<string, unknown>; plan: AgentRunPlan;
}
export interface AgentRunRecord {
  id: string; ownerId: string; projectId: string; status: AgentRunJournalStatus;
  initialGraphRevision: number; currentGraphRevision: number; planHash: string;
  plan: Record<string, unknown>; checkpoint: Record<string, unknown>;
  actionHistory: Record<string, unknown>[]; nextActionIndex: number;
  currentAction?: Record<string, unknown>; cancelRequestedAt?: string; error?: string;
  createdAt: string; updatedAt: string;
}
export interface AgentRunClaim { run: AgentRunRecord; workerId: string; leaseToken: string; }
export interface AgentActionIdentity { actionIndex: number; actionKey: string; actionHash: string; action: Record<string, unknown>; }
export interface AgentActionCheckpoint {
  identity: AgentActionIdentity; outcome: Record<string, unknown>; graphRevision: number;
  nextStatus?: AgentActionCheckpointStatus; error?: string;
}
export type BeginAgentActionState = "STARTED" | "IN_FLIGHT" | "ALREADY_CHECKPOINTED" | "NOT_CLAIMED" | "NOT_FOUND";
