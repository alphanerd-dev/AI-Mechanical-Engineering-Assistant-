import { describe, expect, it, vi } from "vitest";
import { SupabaseDurableAuditStore, verifyDurableAuditRecord } from "../src/audit/durable-store.js";
import type { AuditEventInput } from "../src/audit/types.js";

function createFakeClient(input?: { fail?: boolean }) {
  let inserted: Record<string, unknown> | undefined;
  const single = vi.fn(async () => ({
    data: input?.fail ? null : { event_id: inserted?.event_id, event_hash: inserted?.event_hash },
    error: input?.fail ? { code: "XX000" } : null,
  }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((values: Record<string, unknown>) => {
    inserted = structuredClone(values);
    return { select };
  });
  const from = vi.fn((table: string) => {
    if (table !== "engineering_audit_events") throw new Error("Unexpected audit table");
    return { insert };
  });
  return { client: { from }, inserted: () => inserted, from, insert, select, single };
}

const event: AuditEventInput = {
  timestamp: "2026-10-14T16:00:00.000Z",
  actor: { subject: "user-123", actorType: "USER", roles: ["ENGINEER"] },
  action: "EVIDENCE_WRITE",
  outcome: "SUCCESS",
  projectId: "project-123",
  resourceType: "CAD_COMPLETION",
  resourceId: "completion-123",
  reason: "CAD completion was independently validated.",
  metadata: { status: "ACCEPTED", nested: { z: 1, a: true } },
  correlation: {
    requestId: "request-123", taskId: "model-123", runId: "run-123",
    providerId: "cad.build123d", artifactSha256: "a".repeat(64),
    validatorReceiptId: "receipt-123", decisionId: "decision-123",
  },
};

describe("SupabaseDurableAuditStore", () => {
  it("persists a content-hashed event with correlation identifiers", async () => {
    const fake = createFakeClient();
    const persisted = await new SupabaseDurableAuditStore(fake.client).append(event);
    expect(fake.from).toHaveBeenCalledWith("engineering_audit_events");
    expect(fake.inserted()).toMatchObject({
      actor_subject: "user-123", action: "EVIDENCE_WRITE", outcome: "SUCCESS",
      project_id: "project-123", request_id: "request-123", task_id: "model-123",
      run_id: "run-123", provider_id: "cad.build123d", artifact_sha256: "a".repeat(64),
      validator_receipt_id: "receipt-123", decision_id: "decision-123",
    });
    expect(persisted.event_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => verifyDurableAuditRecord(persisted)).not.toThrow();
  });

  it("detects changes to stored provenance and metadata", async () => {
    const persisted = await new SupabaseDurableAuditStore(createFakeClient().client).append(event);
    expect(() => verifyDurableAuditRecord({ ...persisted, artifact_sha256: "b".repeat(64) }))
      .toThrow("Durable audit event hash is invalid.");
    expect(() => verifyDurableAuditRecord({
      ...persisted, metadata: { status: "ACCEPTED", nested: { z: 1, a: false } },
    })).toThrow("Durable audit event hash is invalid.");
  });

  it("fails closed when the database does not confirm the insert", async () => {
    await expect(new SupabaseDurableAuditStore(createFakeClient({ fail: true }).client).append(event))
      .rejects.toThrow("Durable engineering audit persistence is unavailable.");
  });

  it("rejects malformed artifact digests before issuing a write", async () => {
    const fake = createFakeClient();
    await expect(new SupabaseDurableAuditStore(fake.client).append({
      ...event, correlation: { ...event.correlation, artifactSha256: "not-a-hash" },
    })).rejects.toThrow("artifactSha256");
    expect(fake.insert).not.toHaveBeenCalled();
  });
});
