import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCADDisplayGLB } from "../src/cad/glb.js";
import type { CADDisplayMesh } from "../src/cad/renderer-contract.js";

function mesh(): CADDisplayMesh {
  const sourceArtifactSha256 = createHash("sha256").update("source").digest("hex");
  return {
    artifactId: "derivative-1",
    sourceArtifactId: "source-1",
    sourceArtifactSha256,
    positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
    normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
    indices: new Uint32Array([0,1,2]),
    units: "mm",
    coordinateFrame: "MODEL"
  };
}

describe("createCADDisplayGLB", () => {
  it("creates a valid GLB v2 container with lineage extras and aligned buffers", () => {
    const value = mesh();
    const glb = createCADDisplayGLB(value);
    expect(glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const jsonLength = glb.readUInt32LE(12);
    expect(glb.readUInt32LE(16)).toBe(0x4e4f534a);
    const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8").trim());
    expect(document.asset.version).toBe("2.0");
    expect(document.extras.sourceArtifactId).toBe("source-1");
    expect(document.extras.sourceArtifactSha256).toBe(value.sourceArtifactSha256);
    expect(document.accessors[0].count).toBe(3);
    expect(document.accessors[2].count).toBe(3);
    const binHeader = 20 + jsonLength;
    expect(glb.readUInt32LE(binHeader + 4)).toBe(0x004e4942);
    expect(glb.readUInt32LE(binHeader)).toBe(document.buffers[0].byteLength);
  });

  it("rejects invalid mesh identity, non-finite coordinates and out-of-range indices", () => {
    expect(() => createCADDisplayGLB({ ...mesh(), sourceArtifactSha256: "bad" })).toThrow();
    expect(() => createCADDisplayGLB({ ...mesh(), positions: new Float32Array([0,0,0,1,0,0,NaN,1,0]) })).toThrow();
    expect(() => createCADDisplayGLB({ ...mesh(), indices: new Uint32Array([0,1,3]) })).toThrow();
  });
});
