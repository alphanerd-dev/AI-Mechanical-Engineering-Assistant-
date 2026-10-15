import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEventInput } from "../src/audit/types.js";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn<(
    name: string,
    args: { p_completion?: unknown; p_audit_record?: unknown },
  ) => Promise<{ data: unknown; error: unknown | null }>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/service.js", () => ({
  createServiceRoleClient: () => ({ rpc: mocks.rpc }),
}));

import {
  DurableAuditPersistenceError,
  persistCADCompletionWithAudit,
} from "../src/audit/server.js";

const completionId = "5d3b8843-e722-48b4-97d9-69f2e9b25182";
const projectId = "832e9f62-f5b0-4fa9-a1db-0d5b6ea6f128";
const modelIdentityId = "29a1e9e7-19ab-4f95-8b5a-f9e736a02cc2";

const completion = {
  id: completionId,
  project_id: projectId,
  model_identity_id: modelIdentityId,
  status: "NEEDS_INPUT",
  stage: "INTENT",
  raw_intent: "cylinder",
  intent_resolution: { status: "NEEDS_INPUT" },
  specification: null,
  artifact_records: [],
  engineering_artifacts: [],
  evidence_records: [],
  storage_objects: [],
  errors: [],
  warnings: [],
  created_by: "2ed09d26-86b3-4aab-8a92-a5dd4f151e01",
};

const auditInput: AuditEventInput = {
  timestamp: "2026-10-15T00:10:00.000Z",
  actor: { subject: completion.created_by, actorType: "USER", roles: ["ENGINEER"] },
  action: "TASK_PROPOSE",
  outcome: "PENDING",
  projectId,
  resourceType: "CAD_COMPLETION",
  resourceId: completionId,
  reason: "CAD intent needs additional input; execution was not reported.",
  metadata: { status: "NEEDS_INPUT", stage: "INTENT" },
  correlation: {
    requestId: "request-atomic-test",
    taskId: modelIdentityId,
  },
};

describe("persistCADCompletionWithAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(async (name, args) => {
      if (name !== "record_cad_completion_with_audit") {
        return { data: null, error: { code: "PGRST202" } };
      }
      const record = args?.p_audit_record as Record<string, unknown>;
      const row = args?.p_completion as Record<string, unknown>;
      return {
        data: {
          completion: row,
          audit: {
            event_id: record.event_id,
            event_hash: record.event_hash,
            chain_sequence: 59,
            previous_chain_hash: "c".repeat(64),
            chain_hash: "d".repeat(64),
          },
        },
        error: null,
      };
    });
  });

  it("uses the single atomic RPC and checks its durable chain receipt", async () => {
    const result = await persistCADCompletionWithAudit(completion, auditInput);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("record_cad_completion_with_audit");
    const args = mocks.rpc.mock.calls[0][1] as { p_completion: Record<string, unknown>; p_audit_record: Record<string, unknown> };
    expect(args.p_completion).toMatchObject({
      id: completionId,
      project_id: projectId,
      specification: null,
      status: "NEEDS_INPUT",
    });
    expect(args.p_audit_record).toMatchObject({
      action: "TASK_PROPOSE",
      outcome: "PENDING",
      actor_subject: completion.created_by,
      project_id: projectId,
      resource_type: "CAD_COMPLETION",
      resource_id: completionId,
      task_id: modelIdentityId,
      request_id: "request-atomic-test",
    });
    expect(result.completion.id).toBe(completionId);
    expect(result.audit.chain_sequence).toBe(59);
    expect(result.audit.chain_hash).toBe("d".repeat(64));
  });

  it("fails closed when the database transaction cannot be confirmed", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    await expect(persistCADCompletionWithAudit(completion, auditInput))
      .rejects.toBeInstanceOf(DurableAuditPersistenceError);
  });

  it("rejects a receipt whose completion identity differs from the request", async () => {
    mocks.rpc.mockImplementationOnce(async (_name, args) => {
      const record = args?.p_audit_record as Record<string, unknown>;
      return {
        data: {
          completion: { ...(args?.p_completion as Record<string, unknown>), id: "b5a2512b-4bb2-4b53-9ab1-61c99f5b41ee" },
          audit: {
            event_id: record.event_id,
            event_hash: record.event_hash,
            chain_sequence: 59,
            previous_chain_hash: null,
            chain_hash: "d".repeat(64),
          },
        },
        error: null,
      };
    });
    await expect(persistCADCompletionWithAudit(completion, auditInput))
      .rejects.toBeInstanceOf(DurableAuditPersistenceError);
  });

  it("rejects an incomplete or malformed chain receipt", async () => {
    mocks.rpc.mockImplementationOnce(async (_name, args) => {
      const record = args?.p_audit_record as Record<string, unknown>;
      return {
        data: {
          completion: args?.p_completion,
          audit: {
            event_id: record.event_id,
            event_hash: record.event_hash,
            chain_sequence: 0,
            previous_chain_hash: null,
            chain_hash: "not-a-chain-hash",
          },
        },
        error: null,
      };
    });
    await expect(persistCADCompletionWithAudit(completion, auditInput))
      .rejects.toBeInstanceOf(DurableAuditPersistenceError);
  });
});
