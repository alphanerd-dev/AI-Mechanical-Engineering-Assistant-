import { createHash, randomUUID } from "node:crypto";
import type { AuditAction, AuditCorrelation, AuditEventInput, AuditOutcome } from "./types.js";
import { assertAuditEventInput } from "./trail.js";

export interface DurableAuditRecord {
  event_id: string;
  occurred_at: string;
  actor_subject: string;
  actor_type: "USER" | "AGENT" | "SYSTEM";
  actor_roles: string[];
  action: AuditAction;
  outcome: AuditOutcome;
  project_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  request_id: string | null;
  task_id: string | null;
  run_id: string | null;
  provider_id: string | null;
  artifact_sha256: string | null;
  validator_receipt_id: string | null;
  decision_id: string | null;
  event_hash: string;
}

interface InsertResult { data: unknown; error: unknown | null }
interface InsertBuilder {
  select(columns: string): InsertBuilder;
  single(): Promise<InsertResult>;
}
interface DurableAuditClient {
  from(table: "engineering_audit_events"): {
    insert(values: Record<string, unknown>): InsertBuilder;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Canonicalize JSON so hashes survive PostgreSQL JSONB key-order normalization. */
function stableValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Audit metadata contains a non-finite number.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : stableValue(item));
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
    }
    return result;
  }
  throw new Error("Audit metadata must contain only JSON-safe values.");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function canonicalRow(row: Omit<DurableAuditRecord, "event_hash">): Record<string, unknown> {
  return {
    event_id: row.event_id,
    occurred_at: new Date(row.occurred_at).toISOString(),
    actor_subject: row.actor_subject,
    actor_type: row.actor_type,
    actor_roles: [...row.actor_roles],
    action: row.action,
    outcome: row.outcome,
    project_id: row.project_id ?? null,
    resource_type: row.resource_type ?? null,
    resource_id: row.resource_id ?? null,
    reason: row.reason ?? null,
    metadata: row.metadata ?? {},
    request_id: row.request_id ?? null,
    task_id: row.task_id ?? null,
    run_id: row.run_id ?? null,
    provider_id: row.provider_id ?? null,
    artifact_sha256: row.artifact_sha256 ?? null,
    validator_receipt_id: row.validator_receipt_id ?? null,
    decision_id: row.decision_id ?? null,
  };
}

function recordHash(row: Omit<DurableAuditRecord, "event_hash">): string {
  return createHash("sha256").update(stableStringify(canonicalRow(row)), "utf8").digest("hex");
}

function correlationValues(correlation: AuditCorrelation | undefined) {
  return {
    request_id: correlation?.requestId ?? null,
    task_id: correlation?.taskId ?? null,
    run_id: correlation?.runId ?? null,
    provider_id: correlation?.providerId ?? null,
    artifact_sha256: correlation?.artifactSha256 ?? null,
    validator_receipt_id: correlation?.validatorReceiptId ?? null,
    decision_id: correlation?.decisionId ?? null,
  };
}

function buildRecord(input: AuditEventInput): DurableAuditRecord {
  assertAuditEventInput(input);
  const metadata = stableValue(input.metadata ?? {});
  if (!isRecord(metadata)) throw new Error("Audit metadata must be an object.");
  const withoutHash: Omit<DurableAuditRecord, "event_hash"> = {
    event_id: randomUUID(),
    occurred_at: new Date(input.timestamp).toISOString(),
    actor_subject: input.actor.subject,
    actor_type: input.actor.actorType,
    actor_roles: [...(input.actor.roles ?? [])],
    action: input.action,
    outcome: input.outcome,
    project_id: input.projectId ?? null,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    reason: input.reason ?? null,
    metadata: metadata as Record<string, unknown>,
    ...correlationValues(input.correlation),
  };
  return { ...withoutHash, event_hash: recordHash(withoutHash) };
}

export class DurableAuditPersistenceError extends Error {
  constructor() {
    super("Durable engineering audit persistence is unavailable.");
    this.name = "DurableAuditPersistenceError";
  }
}

/** Insert-only persistence. The table grants no UPDATE/DELETE to service_role. */
export class SupabaseDurableAuditStore {
  constructor(private readonly client: unknown) {}

  async append(input: AuditEventInput): Promise<DurableAuditRecord> {
    const record = buildRecord(input);
    try {
      const result = await (this.client as DurableAuditClient)
        .from("engineering_audit_events")
        .insert(record as unknown as Record<string, unknown>)
        .select("event_id,event_hash")
        .single();
      if (result.error || !isRecord(result.data) ||
          result.data.event_id !== record.event_id ||
          result.data.event_hash !== record.event_hash) {
        throw new DurableAuditPersistenceError();
      }
      return record;
    } catch {
      throw new DurableAuditPersistenceError();
    }
  }
}

export function verifyDurableAuditRecord(record: DurableAuditRecord): void {
  if (!record || typeof record !== "object" ||
      typeof record.event_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.event_hash)) {
    throw new Error("Durable audit event hash is invalid.");
  }
  const { event_hash, ...withoutHash } = record;
  if (recordHash(withoutHash) !== event_hash) {
    throw new Error("Durable audit event hash is invalid.");
  }
}
