import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCADDisplayGLB } from "../src/cad/glb.js";
import { parseCADDisplayGLB } from "../src/cad/glb-preview.js";
import type { CADDisplayMesh } from "../src/cad/renderer-contract.js";

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function mesh(): CADDisplayMesh {
  return {
    artifactId: "display-1",
    sourceArtifactId: "source-1",
    sourceArtifactSha256: createHash("sha256").update("source").digest("hex"),
    positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
    normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
    indices: new Uint32Array([0,1,2]),
    units: "mm",
    coordinateFrame: "MODEL"
  };
}

describe("parseCADDisplayGLB", () => {
  it("reads only the bounded GLB v2 profile and preserves source lineage", () => {
    const source = mesh();
    const glb = createCADDisplayGLB(source);
    const parsed = parseCADDisplayGLB(toArrayBuffer(glb));
    expect(parsed.triangleCount).toBe(1);
    expect(parsed.positions.length).toBe(9);
    expect(parsed.normals.length).toBe(9);
    expect(parsed.sourceArtifactId).toBe(source.sourceArtifactId);
    expect(parsed.sourceArtifactSha256).toBe(source.sourceArtifactSha256);
    expect(parsed.units).toBe("mm");
  });

  it("rejects malformed headers, invalid lineage and external buffer declarations", () => {
    const glb = createCADDisplayGLB(mesh());
    const malformed = glb.slice();
    malformed.writeUInt32LE(0, 0);
    expect(() => parseCADDisplayGLB(toArrayBuffer(malformed))).toThrow("header");
    const external = createCADDisplayGLB(mesh());
    const jsonLength = external.readUInt32LE(12);
    const document = JSON.parse(external.subarray(20, 20 + jsonLength).toString("utf8").trim());
    document.buffers[0].uri = "https://untrusted.example/mesh.bin";
    const json = Buffer.from(JSON.stringify(document));
    const paddedLength = (json.length + 3) & ~3;
    const binaryHeader = 20 + jsonLength;
    const binaryLength = external.readUInt32LE(binaryHeader);
    const rebuilt = Buffer.alloc(12 + 8 + paddedLength + 8 + binaryLength);
    rebuilt.writeUInt32LE(0x46546c67, 0);
    rebuilt.writeUInt32LE(2, 4);
    rebuilt.writeUInt32LE(rebuilt.length, 8);
    rebuilt.writeUInt32LE(paddedLength, 12);
    rebuilt.writeUInt32LE(0x4e4f534a, 16);
    json.copy(rebuilt, 20);
    rebuilt.fill(0x20, 20 + json.length, 20 + paddedLength);
    rebuilt.writeUInt32LE(binaryLength, 20 + paddedLength);
    rebuilt.writeUInt32LE(0x004e4942, 24 + paddedLength);
    external.copy(rebuilt, 28 + paddedLength, binaryHeader + 8);
    expect(() => parseCADDisplayGLB(toArrayBuffer(rebuilt))).toThrow("buffer declaration");
  });
});
