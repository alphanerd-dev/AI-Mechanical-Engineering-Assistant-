import { describe, expect, it } from "vitest";
import { classifyCADDisplayDerivative, validateCADDisplayDerivative, type CADDisplayDerivative } from "../src/cad/display-derivative.js";

const derivative: CADDisplayDerivative = {
  schemaVersion: 1,
  artifactId: "mesh-1",
  format: "GLB",
  sourceArtifactId: "brep-1",
  sourceArtifactSha256: "a".repeat(64),
  modelIdentityId: "model-1",
  modelRevision: 3,
  converter: { providerId: "cad.occt.tessellator", version: "1.0.0", operation: "TESSELLATE" },
  tessellation: { linearDeflectionMm: 0.1, angularDeflectionRad: 0.35, relative: false },
  units: "mm",
  coordinateFrame: "MODEL",
  artifactSha256: "b".repeat(64),
  generatedAt: "2026-11-08T00:00:00.000Z"
};

describe("CAD display derivative contract", () => {
  it("accepts a digest-bound derivative with explicit conversion settings", () => {
    expect(validateCADDisplayDerivative(derivative)).toEqual({ valid: true, errors: [] });
  });

  it("rejects incomplete lineage, invalid digests and unbounded tessellation settings", () => {
    const invalid = {
      ...derivative,
      sourceArtifactSha256: "not-a-digest",
      modelRevision: 0,
      tessellation: { ...derivative.tessellation, angularDeflectionRad: 4 }
    };
    const result = validateCADDisplayDerivative(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("sourceArtifactSha256");
    expect(result.errors.join(" ")).toContain("modelRevision");
    expect(result.errors.join(" ")).toContain("angularDeflectionRad");
  });

  it("marks a derivative stale when source digest or model revision changes", () => {
    const source = { id: "brep-1", provenance: { artifactSha256: "a".repeat(64) } };
    expect(classifyCADDisplayDerivative(derivative, source, { id: "model-1", revision: 3 })).toBe("CURRENT");
    expect(classifyCADDisplayDerivative(derivative, { ...source, provenance: { artifactSha256: "c".repeat(64) } }, { id: "model-1", revision: 3 })).toBe("STALE");
    expect(classifyCADDisplayDerivative(derivative, source, { id: "model-1", revision: 4 })).toBe("STALE");
    expect(classifyCADDisplayDerivative(derivative, null, null)).toBe("UNVERIFIABLE");
  });
});
