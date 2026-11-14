import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveCanonicalSolid, verifyStoredBrep } from "../src/cad/geometry-revision-persistence-source";
import type { Completion, GeometryRevisionDatabase } from "../src/cad/geometry-revision-persistence-types";

const projectId = "11111111-1111-4111-8111-111111111111";
const completionId = "22222222-2222-4222-8222-222222222222";
const modelId = "33333333-3333-4333-8333-333333333333";
const executionId = "44444444-4444-4444-8444-444444444444";
const objectPath = [projectId, modelId, executionId, "solid.brep"].join("/");
const bytes = Buffer.from("synthetic-brep");

function completionFixture(): Completion {
  return {
    id: completionId, project_id: projectId, model_identity_id: modelId, execution_id: executionId,
    status: "ACCEPTED", created_by: "55555555-5555-4555-8555-555555555555",
    evidence_records: [{ id: "evidence-1" }], validation_receipt: { id: "validation-1" },
    storage_objects: [objectPath],
    artifact_records: [{
      id: "solid-1", kind: "SOLID", validationStatus: "PASS",
      uri: "storage://engineering-cad-artifacts/" + objectPath,
      provenance: {
        projectId, modelIdentityId: modelId, executionId, providerId: "cad.build123d",
        providerVersion: "0.13.0", backend: "build123d",
        artifactSha256: createHash("sha256").update(bytes).digest("hex")
      }
    }]
  };
}

describe("trusted geometry revision source verification", () => {
  it("resolves only the canonical SOLID bound to the accepted completion", () => {
    const result = resolveCanonicalSolid(completionFixture(), projectId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.objectPath).toBe(objectPath);
      expect(result.value.provenance.providerVersion).toBe("0.13.0");
    }
  });

  it("rejects a SOLID whose storage object is not bound to the completion", () => {
    const completion = completionFixture();
    const artifact = completion.artifact_records[0] as Record<string, unknown>;
    artifact.uri = "storage://engineering-cad-artifacts/forged/solid.brep";
    const result = resolveCanonicalSolid(completion, projectId);
    expect(result.ok).toBe(false);
  });

  it("rejects missing trusted provider version provenance", () => {
    const completion = completionFixture();
    const artifact = completion.artifact_records[0] as Record<string, unknown>;
    const provenance = artifact.provenance as Record<string, unknown>;
    delete provenance.providerVersion;
    const result = resolveCanonicalSolid(completion, projectId);
    expect(result.ok).toBe(false);
  });

  it("recomputes the stored BREP digest from the exact private object bytes", async () => {
    const source = resolveCanonicalSolid(completionFixture(), projectId);
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const db = {
      storage: {
        from: (bucket: string) => ({
          download: async (path: string) => ({
            data: bucket === "engineering-cad-artifacts" && path === objectPath ? new Blob([bytes]) : null,
            error: null
          })
        })
      }
    } as unknown as GeometryRevisionDatabase;
    const digest = await verifyStoredBrep(db, source.value);
    expect(digest.ok).toBe(true);
    if (digest.ok) expect(digest.value).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
