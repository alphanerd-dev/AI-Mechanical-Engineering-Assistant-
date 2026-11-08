import { describe, expect, it } from "vitest";
import { isCADDisplayMesh } from "../src/cad/renderer-contract.js";
import { unavailableGeometryResult, validateCADGeometrySource, verifyCADGeometrySourceDigest } from "../src/cad/geometry-kernel-contract.js";

describe("CAD renderer and geometry-kernel contracts", () => {
  it("validates renderer-neutral mesh input without depending on an engine type", () => {
    const mesh = {
      artifactId: "mesh-1", sourceArtifactId: "brep-1", sourceArtifactSha256: "a".repeat(64),
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]), units: "mm", coordinateFrame: "MODEL"
    };
    expect(isCADDisplayMesh(mesh)).toBe(true);
    expect(isCADDisplayMesh({ ...mesh, sourceArtifactSha256: "bad" })).toBe(false);
  });

  it("requires digest, model revision, format and bounded exact source bytes for geometry operations", () => {
    const source = {
      artifactId: "step-1", modelIdentityId: "model-1", modelRevision: 2,
      format: "STEP", sha256: "a".repeat(64), bytes: new Uint8Array([1, 2, 3]),
      units: "mm", coordinateFrame: "MODEL"
    };
    expect(validateCADGeometrySource(source)).toEqual([]);
    expect(validateCADGeometrySource({ ...source, modelRevision: 0, sha256: "invalid" })).toHaveLength(2);
  });

  it("verifies the digest against the exact source bytes", async () => {
    const source = {
      artifactId: "step-1", modelIdentityId: "model-1", modelRevision: 2,
      format: "STEP", sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      bytes: new Uint8Array([1, 2, 3]), units: "mm", coordinateFrame: "MODEL"
    };
    await expect(verifyCADGeometrySourceDigest(source)).resolves.toBe(true);
    await expect(verifyCADGeometrySourceDigest({ ...source, sha256: "a".repeat(64) })).resolves.toBe(false);
  });

  it("rejects display meshes with non-finite coordinates, mismatched normals or invalid indices", () => {
    const mesh = {
      artifactId: "mesh-1", sourceArtifactId: "brep-1", sourceArtifactSha256: "a".repeat(64),
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]), units: "mm", coordinateFrame: "MODEL"
    };
    expect(isCADDisplayMesh({ ...mesh, positions: new Float32Array([0, 0, 0, NaN, 0, 0, 0, 1, 0]) })).toBe(false);
    expect(isCADDisplayMesh({ ...mesh, normals: new Float32Array([0, 0, 1]) })).toBe(false);
    expect(isCADDisplayMesh({ ...mesh, indices: new Uint32Array([0, 1, 9]) })).toBe(false);
  });

  it("reports unsupported geometry operations instead of pretending the validator can tessellate", () => {
    expect(unavailableGeometryResult("STEP import")).toMatchObject({
      status: "UNSUPPORTED",
      limitations: ["STEP import is not implemented by the current OCCT validation worker."]
    });
  });
});
