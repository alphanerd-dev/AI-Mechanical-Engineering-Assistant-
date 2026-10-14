import "server-only";
import { createServiceRoleClient } from "../../lib/supabase/service";
import type { AuditEventInput } from "./types.js";
import {
  buildDurableAuditRecord,
  DurableAuditPersistenceError,
  SupabaseDurableAuditStore,
  verifyDurableAuditRecord,
  type DurableAuditRecord,
} from "./durable-store.js";

interface ServerAuditClient {
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown | null }>;
  from(table: "engineering_audit_events"): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): Promise<{ data: unknown; error: unknown | null }>;
        };
      };
    };
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Server-only writer; browser clients cannot call this module. */
export async function persistEngineeringAuditEvent(input: AuditEventInput) {
  return new SupabaseDurableAuditStore(createServiceRoleClient()).append(input);
}

/**
 * Commits a CAD completion and its durable provenance event in one PostgreSQL
 * transaction. A failed audit insert rolls back the completion insert.
 */
export async function persistCADCompletionWithAudit(
  completion: Record<string, unknown>,
  input: AuditEventInput,
): Promise<{ completion: Record<string, unknown>; audit: DurableAuditRecord }> {
  const auditRecord = buildDurableAuditRecord(input);
  try {
    const client = createServiceRoleClient() as unknown as ServerAuditClient;
    const result = await client.rpc("record_cad_completion_with_audit", {
      p_completion: completion,
      p_audit_record: auditRecord,
    });
    if (result.error || !record(result.data) ||
        !record(result.data.completion) || !record(result.data.audit)) {
      throw new DurableAuditPersistenceError();
    }
    const persisted = result.data.completion;
    const receipt = result.data.audit;
    if (persisted.id !== completion.id ||
        receipt.event_id !== auditRecord.event_id ||
        receipt.event_hash !== auditRecord.event_hash ||
        !Number.isSafeInteger(Number(receipt.chain_sequence)) ||
        Number(receipt.chain_sequence) < 1 ||
        typeof receipt.chain_hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(receipt.chain_hash) ||
        (receipt.previous_chain_hash !== null &&
          (typeof receipt.previous_chain_hash !== "string" ||
            !/^[a-f0-9]{64}$/.test(receipt.previous_chain_hash)))) {
      throw new DurableAuditPersistenceError();
    }
    return {
      completion: persisted,
      audit: {
        ...auditRecord,
        chain_sequence: Number(receipt.chain_sequence),
        previous_chain_hash: receipt.previous_chain_hash as string | null,
        chain_hash: receipt.chain_hash,
      },
    };
  } catch {
    throw new DurableAuditPersistenceError();
  }
}

export class DurableAuditIntegrityError extends Error {
  constructor() {
    super("Durable engineering audit integrity verification failed.");
    this.name = "DurableAuditIntegrityError";
  }
}

/** Read and verify persisted events. Caller must authorize the project first. */
export async function readEngineeringAuditEvents(
  projectId: string,
  requestedLimit = 100,
): Promise<{ events: DurableAuditRecord[]; chainIntegrity: Record<string, unknown> }> {
  const limit = Math.min(200, Math.max(1, Math.trunc(requestedLimit)));
  const client = createServiceRoleClient() as unknown as ServerAuditClient;
  try {
    const [eventResult, verificationResult] = await Promise.all([
      client.from("engineering_audit_events")
        .select("*")
        .eq("project_id", projectId)
        .order("chain_sequence", { ascending: true })
        .limit(limit),
      client.rpc("verify_engineering_audit_chain"),
    ]);
    if (eventResult.error || !Array.isArray(eventResult.data) ||
        verificationResult.error || !record(verificationResult.data) ||
        verificationResult.data.verified !== true) {
      throw new DurableAuditIntegrityError();
    }

    const events: DurableAuditRecord[] = [];
    for (const value of eventResult.data) {
      if (!record(value)) throw new DurableAuditIntegrityError();
      const item = value as unknown as DurableAuditRecord;
      try {
        verifyDurableAuditRecord(item);
      } catch {
        throw new DurableAuditIntegrityError();
      }
      events.push(item);
    }
    return { events, chainIntegrity: verificationResult.data };
  } catch (error) {
    if (error instanceof DurableAuditIntegrityError) throw error;
    throw new DurableAuditPersistenceError();
  }
}
\nexport { DurableAuditPersistenceError };\n