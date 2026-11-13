import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CADGeometrySource } from "../src/cad/geometry-kernel-contract.js";
import { RemoteOCCTGeometryExecutor } from "../src/execution/remote-occt-geometry.js";

const config = {
  baseUrl: "https://cad-worker.onrender.com",
  token: "a".repeat(64),
  artifactRoot: "/tmp/cad-artifacts"
};
function source(): CADGeometrySource {
  const bytes = new TextEncoder().encode("remote-source-geometry");
  return {
    artifactId: "remote-artifact", modelIdentityId: "model-remote", modelRevision: 3,
    format: "BREP", sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes, units: "mm", coordinateFrame: "MODEL"
  };
}
function response(sourceSha: string) {
  const positions = Buffer.alloc(36);
  [0,0,0,1,0,0,0,1,0].forEach((v,i)=>positions.writeFloatLE(v,i*4));
  const normals = Buffer.alloc(36);
  [0,0,1,0,0,1,0,0,1].forEach((v,i)=>normals.writeFloatLE(v,i*4));
  const indices = Buffer.alloc(12);
  [0,1,2].forEach((v,i)=>indices.writeUInt32LE(v,i*4));
  return {
    status: "COMPLETED", providerId: "occt.geometry-kernel",
    providerVersion: "build123d-0.13.0/OCP", artifactSha256: sourceSha,
    errors: [], limitations: [],
    topology: { solids: 1, shells: 1, faces: 1, edges: 3, vertices: 3, valid: true },
    tessellation: {
      vertexCount: 3, triangleCount: 1,
      positionsFloat32LE: positions.toString("base64"),
      normalsFloat32LE: normals.toString("base64"),
      indicesUint32LE: indices.toString("base64"),
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35,
      relativeDeflection: false, units: "mm", coordinateFrame: "MODEL"
    }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("RemoteOCCTGeometryExecutor", () => {
  it("sends digest-bound bytes to the authenticated geometry endpoint and verifies topology", async () => {
    const input = source();
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(response(input.sha256)), {
      status: 200, headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchStub);
    const executor = new RemoteOCCTGeometryExecutor(config);
    await expect(executor.inspect(input)).resolves.toMatchObject({ solids: 1, valid: true });
    const [url, init] = fetchStub.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://cad-worker.onrender.com/v1/cad/geometry");
    expect((init.headers as Record<string,string>).authorization).toBe("Bearer " + config.token);
    const payload = JSON.parse(String(init.body));
    expect(payload.operation).toBe("INSPECT");
    expect(payload.artifactSha256).toBe(input.sha256);
  });

  it("decodes typed mesh buffers and carries source lineage", async () => {
    const input = source();
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(response(input.sha256)), {
      status: 200, headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchStub);
    const executor = new RemoteOCCTGeometryExecutor(config);
    const mesh = await executor.tessellate(input, {
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35
    });
    expect(Array.from(mesh.positions)).toEqual([0,0,0,1,0,0,0,1,0]);
    expect(Array.from(mesh.indices)).toEqual([0,1,2]);
    expect(mesh.sourceArtifactId).toBe(input.artifactId);
  });

  it("rejects oversized, changed or non-mm sources before network access", async () => {
    const input = source();
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    const executor = new RemoteOCCTGeometryExecutor(config);
    await expect(executor.inspect({ ...input, sha256: "f".repeat(64) })).rejects.toThrow("SHA-256");
    await expect(executor.inspect({ ...input, units: "in" })).rejects.toThrow("millimetre");
    await expect(executor.inspect({ ...input, bytes: new Uint8Array(4 * 1024 * 1024 + 1) })).rejects.toThrow("4 MiB");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects a response bound to a different source digest", async () => {
    const input = source();
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(response("b".repeat(64))), {
      status: 200, headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchStub);
    const executor = new RemoteOCCTGeometryExecutor(config);
    await expect(executor.inspect(input)).rejects.toThrow("Remote OCCT geometry operation failed");
  });
});
