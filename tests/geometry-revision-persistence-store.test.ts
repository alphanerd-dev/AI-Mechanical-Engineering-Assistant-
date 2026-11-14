import { describe, expect, it, vi } from "vitest";
import { commitRevision } from "../src/cad/geometry-revision-persistence-store";
import type { RevisionPayload } from "../src/cad/geometry-revision-persistence-store";
import type { GeometryRevisionV1 } from "../src/cad/geometry-revision";
import type { CanonicalSolid, Completion, GeometryRevisionDatabase } from "../src/cad/geometry-revision-persistence-types";

const projectId = "11111111-1111-4111-8111-111111111111";
const modelId = "22222222-2222-4222-8222-222222222222";
const completionId = "33333333-3333-4333-8333-333333333333";
const artifactId = "solid-1";
const digest = "a".repeat(64);
const objectPath = [projectId, modelId, "execution-1", "solid.brep"].join("/");

const completion: Completion = {
  id: completionId, project_id: projectId, model_identity_id: modelId,
  execution_id: "execution-1", status: "ACCEPTED", artifact_records: [],
  evidence_records: [{}], validation_receipt: {}, storage_objects: [objectPath],
  created_by: "44444444-4444-4444-8444-444444444444"
};
const solid: CanonicalSolid = {
  id: artifactId, objectPath,
  provenance: { providerId: "cad.build123d", providerVersion: "0.13.0", backend: "build123d" }
};
const payload: RevisionPayload = {
  revisionId: "55555555-5555-4555-8555-555555555555",
  candidate: {} as GeometryRevisionV1,
  revisionRecord: { id: "55555555-5555-4555-8555-555555555555" },
  auditRecord: { event_id: "event-1", event_hash: "hash-1" }
};

function database(input: {
  rpcData?: unknown; rpcError?: unknown; prior?: Record<string, unknown> | null;
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: input.prior ?? null, error: null }))
  };
  const rpc = vi.fn(async () => ({ data: input.rpcData ?? null, error: input.rpcError ?? null }));
  const from = vi.fn(() => query);
  return {
    db: { rpc, from } as unknown as GeometryRevisionDatabase,
    rpc, from, query
  };
}

describe("geometry revision atomic persistence", () => {
  it("accepts only a matching revision and audit receipt from the atomic RPC", async () => {
    const fixture = database({
      rpcData: {
        revision: { id: payload.revisionId },
        audit: { event_id: "event-1", event_hash: "hash-1" }
      }
    });
    const result = await commitRevision({
      db: fixture.db, payload, projectId, completion, solid, digest
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.replay).toBe(false);
      expect(result.value.audit.event_id).toBe("event-1");
    }
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it("returns HTTP conflict semantics when another writer advances the geometry head", async () => {
    const fixture = database({
      rpcError: { code: "40001", message: "STALE_GEOMETRY_REVISION: expected parent is not current" }
    });
    const result = await commitRevision({
      db: fixture.db, payload, projectId, completion, solid, digest
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.message).toContain("another geometry revision advanced");
    }
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it("reconciles an RPC retry against the immutable revision already committed", async () => {
    const fixture = database({
      rpcError: { code: "ECONNRESET", message: "connection dropped after commit" },
      prior: {
        id: payload.revisionId, canonical_artifact_sha256: digest,
        storage_object_name: objectPath
      }
    });
    const result = await commitRevision({
      db: fixture.db, payload, projectId, completion, solid, digest
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.replay).toBe(true);
      expect(result.value.revision.id).toBe(payload.revisionId);
    }
  });

  it("does not report success when neither the atomic receipt nor a matching revision exists", async () => {
    const fixture = database({ rpcError: { code: "XX000", message: "transaction failed" } });
    const result = await commitRevision({
      db: fixture.db, payload, projectId, completion, solid, digest
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });
});
