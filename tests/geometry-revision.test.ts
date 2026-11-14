import { describe, expect, it } from "vitest";
import { validateGeometryRevisionV1 } from "../src/cad/geometry-revision.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const modelIdentityId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const completionId = "44444444-4444-4444-8444-444444444444";
const operationId = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64);

function revision(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    geometryRevisionId: revisionId,
    projectId,
    modelIdentityId,
    geometryRevisionNumber: 1,
    parentGeometryRevisionId: null,
    sourceCompletionId: completionId,
    sourceOperationId: operationId,
    storageBucket: "engineering-cad-artifacts",
    storageObjectName: projectId + "/" + modelIdentityId + "/" + operationId + "/solid.brep",
    canonicalArtifact: {
      artifactId: "project-cad-operation-solid",
      artifactKind: "SOLID",
      format: "BREP",
      artifactSha256: digest,
      units: "mm",
      coordinateFrameId: "WORLD_Z_AXIS"
    },
    provider: {
      providerId: "cad.build123d",
      providerVersion: "0.13.0",
      executionBackend: "build123d"
    },
    createdAt: "2026-11-14T18:00:00.000Z",
    ...overrides
  };
}

describe("G2 geometry revision identity contract", () => {
  it("accepts a first immutable BREP revision with explicit lineage", () => {
    expect(validateGeometryRevisionV1(revision())).toEqual({ status: "PASS", errors: [] });
  });

  it("accepts a child revision with a parent and monotonic number", () => {
    expect(validateGeometryRevisionV1(revision({
      geometryRevisionId: "66666666-6666-4666-8666-666666666666",
      geometryRevisionNumber: 2,
      parentGeometryRevisionId: revisionId
    }))).toEqual({ status: "PASS", errors: [] });
  });

  it("rejects a source digest that is not a lowercase SHA-256 value", () => {
    const value = revision();
    (value.canonicalArtifact as Record<string, unknown>).artifactSha256 = "not-a-digest";
    expect(validateGeometryRevisionV1(value).errors).toContain(
      "canonicalArtifact.artifactSha256 must be a lowercase SHA-256 digest."
    );
  });

  it("rejects source-code/display derivatives as canonical geometry", () => {
    const value = revision();
    (value.canonicalArtifact as Record<string, unknown>).format = "STL";
    expect(validateGeometryRevisionV1(value).errors).toContain("canonicalArtifact.format must be BREP.");
  });

  it("rejects a revision without its required parent", () => {
    const result = validateGeometryRevisionV1(revision({
      geometryRevisionNumber: 2,
      parentGeometryRevisionId: null
    }));
    expect(result.status).toBe("FAIL");
    expect(result.errors).toContain("Geometry revisions after the first must identify their parent.");
  });

  it("rejects a storage object outside the exact source completion BREP path", () => {
    const result = validateGeometryRevisionV1(revision({ storageObjectName: "../../other-project/solid.brep" }));
    expect(result.status).toBe("FAIL");
    expect(result.errors).toContain("storageObjectName must identify the exact source completion BREP object.");
  });

  it("rejects unsupported execution backends and coordinate frames", () => {
    const value = revision();
    (value.provider as Record<string, unknown>).executionBackend = "unknown";
    (value.canonicalArtifact as Record<string, unknown>).coordinateFrameId = "LOCAL";
    const errors = validateGeometryRevisionV1(value).errors;
    expect(errors).toContain("provider.executionBackend is unsupported.");
    expect(errors).toContain("canonicalArtifact.coordinateFrameId must be WORLD_Z_AXIS.");
  });
});
