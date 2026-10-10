import { describe, expect, it } from "vitest";
import { cadArtifactStoragePath, cadArtifactStorageUri, isVerifiedCADCompletion } from "../src/cad/persistence.js";
import type { CADPartCompletionResult } from "../src/cad/completion.js";
import type { CADArtifactKind } from "../src/cad/artifacts.js";

const projectId = "5f7d1b40-5b7e-4f5b-9d77-30a8f81eaa01";
const modelIdentityId = "664f11d1-20ef-46fd-9fa4-42f8f2a9a602";
const executionId = "bd54de83-f4d7-4f8c-9644-5f2b6e1dcb32";

describe("CAD completion persistence boundary", () => {
  it("generates project-scoped object keys without trusting user-controlled filenames", () => {
    expect(cadArtifactStoragePath({ projectId, modelIdentityId, executionId, kind: "SOLID" }))
      .toBe(projectId + "/" + modelIdentityId + "/" + executionId + "/solid.brep");
    expect(cadArtifactStoragePath({ projectId, modelIdentityId, executionId, kind: "THREE_MF" }))
      .toBe(projectId + "/" + modelIdentityId + "/" + executionId + "/three_mf.3mf");
    expect(cadArtifactStorageUri(projectId + "/" + modelIdentityId + "/" + executionId + "/solid.brep"))
      .toBe("storage://engineering-cad-artifacts/" + projectId + "/" + modelIdentityId + "/" + executionId + "/solid.brep");
  });

  it("rejects traversal and unsupported artifact kinds", () => {
    expect(() => cadArtifactStoragePath({ projectId, modelIdentityId: "../other", executionId, kind: "SOLID" })).toThrow("unsafe path");
    expect(() => cadArtifactStorageUri("../private/secret.brep")).toThrow("invalid");
    expect(() => cadArtifactStorageUri(projectId + "/" + modelIdentityId + "/" + executionId + "/../secret.brep")).toThrow("invalid");
    expect(() => cadArtifactStorageUri(projectId + "/" + modelIdentityId + "/" + executionId + "/other.bin")).toThrow("invalid");
    expect(() => cadArtifactStoragePath({ projectId, modelIdentityId, executionId, kind: "DRAWING" as CADArtifactKind })).toThrow("Unsupported");
  });

  it("never treats a claimed status as verified without a consistent bundle", () => {
    const claimed = { status: "ACCEPTED" } as unknown as CADPartCompletionResult;
    expect(isVerifiedCADCompletion(claimed)).toBe(false);
  });

  it("requires the host-computed digest to match the accepted CAD artifact", () => {
    const result = {
      status: "ACCEPTED",
      specification: { kind: "CYLINDER", name: "shaft", diameterMm: 30, lengthMm: 200 },
      acceptance: { status: "ACCEPTED", acceptance: { accepted: true } },
      bundle: {
        cad: { id: "solid-1", kind: "SOLID", validationStatus: "PASS", informationStatus: "VERIFIED",
          provenance: { providerId: "cad.build123d", sourceSha256: "a".repeat(64), artifactSha256: "b".repeat(64) } },
        engineering: { id: "solid-1-engineering", validationStatus: "PASS", informationStatus: "VERIFIED" },
        evidence: { id: "evidence-1", type: "GEOMETRY_CHECK", status: "VERIFIED",
          artifactIds: ["solid-1", "solid-1-engineering"], value: {
            artifactSha256: "b".repeat(64), artifactId: "solid-1", sourceSha256: "a".repeat(64),
            validatorProviderId: "cad.occt",
            validatorVersion: "occt-test-1",
            checkedAt: "2026-10-10T00:00:00.000Z",
            validation: { valid: true, solidCount: 1 },
            geometryMeasurements: {
              volumeMm3: Math.PI * 15 * 15 * 200,
              boundingBoxMm: { x: 30, y: 30, z: 200 },
              dimensionChecks: [
                { axis: "x", actualMm: 30, expectedMm: 30, toleranceMm: 0.01, passed: true },
                { axis: "y", actualMm: 30, expectedMm: 30, toleranceMm: 0.01, passed: true },
                { axis: "z", actualMm: 200, expectedMm: 200, toleranceMm: 0.01, passed: true }
              ]
            }
          } }
      }
    } as unknown as CADPartCompletionResult;
    expect(isVerifiedCADCompletion(result)).toBe(true);
    const receipt = result.bundle!.evidence.value as Record<string, unknown>;
    const measuredReceipt = { ...receipt };
    delete measuredReceipt.geometryMeasurements;
    result.bundle!.evidence.value = measuredReceipt;
    expect(isVerifiedCADCompletion(result)).toBe(false);
    result.bundle!.evidence.value = receipt;
    result.bundle!.cad.provenance!.artifactSha256 = "c".repeat(64);
    expect(isVerifiedCADCompletion(result)).toBe(false);
  });
});
