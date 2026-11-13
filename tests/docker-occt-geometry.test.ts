import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CADCommandRunner,
  CADCommandRunOptions,
  CADCommandRunResult
} from "../src/execution/docker-build123d-transport.js";
import { DockerOCCTGeometryExecutor } from "../src/execution/docker-occt-geometry.js";
import { DockerOCCTGeometryKernelAdapter } from "../src/providers/occt-geometry.js";
import type { CADGeometrySource } from "../src/cad/geometry-kernel-contract.js";

class FakeRunner implements CADCommandRunner {
  calls: Array<{ command: string; args: string[]; stdin: string; options: CADCommandRunOptions }> = [];
  result: CADCommandRunResult = {
    exitCode: 0, signal: null, stdout: JSON.stringify({
      status: "COMPLETED", providerId: "occt.geometry-kernel",
      providerVersion: "build123d-0.13.0/OCP", errors: [], limitations: [],
      topology: { solids: 1, shells: 1, faces: 6, edges: 12, vertices: 8, valid: true }
    }), stderr: "", timedOut: false, outputLimitExceeded: false
  };
  async run(command: string, args: string[], stdin: string, options: CADCommandRunOptions): Promise<CADCommandRunResult> {
    this.calls.push({ command, args, stdin, options });
    return this.result;
  }
}

const roots: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}
function source(format: "BREP" | "STEP" = "BREP"): CADGeometrySource {
  const bytes = new TextEncoder().encode("deterministic-source-geometry");
  return {
    artifactId: "source-geometry-1", modelIdentityId: "model-1", modelRevision: 4,
    format, sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes, units: "mm", coordinateFrame: "MODEL"
  };
}
function meshResponse() {
  const floatBuffer = Buffer.alloc(9 * 4);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => floatBuffer.writeFloatLE(value, index * 4));
  const normalBuffer = Buffer.alloc(9 * 4);
  [0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((value, index) => normalBuffer.writeFloatLE(value, index * 4));
  const indexBuffer = Buffer.alloc(3 * 4);
  [0, 1, 2].forEach((value, index) => indexBuffer.writeUInt32LE(value, index * 4));
  return {
    status: "COMPLETED", providerId: "occt.geometry-kernel",
    providerVersion: "build123d-0.13.0/OCP", errors: [], limitations: [],
    topology: { solids: 1, shells: 1, faces: 1, edges: 3, vertices: 3, valid: true },
    tessellation: {
      vertexCount: 3, triangleCount: 1,
      positionsFloat32LE: floatBuffer.toString("base64"),
      normalsFloat32LE: normalBuffer.toString("base64"),
      indicesUint32LE: indexBuffer.toString("base64"),
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35,
      relativeDeflection: false, units: "mm", coordinateFrame: "MODEL"
    }
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DockerOCCTGeometryExecutor", () => {
  async function setup() {
    const scriptRoot = await tempDir("ama-occt-geometry-script-");
    const workerScriptPath = path.join(scriptRoot, "geometry_kernel.py");
    await writeFile(workerScriptPath, "# trusted worker fixture\n");
    const runner = new FakeRunner();
    const executor = new DockerOCCTGeometryExecutor({
      image: "local/ama-build123d:0.13.0", workerScriptPath, runner
    });
    return { runner, executor };
  }

  it("runs import/inspection in a network-disabled, read-only container with exact source bytes", async () => {
    const { runner, executor } = await setup();
    const result = await executor.inspect(source("STEP"));
    expect(result).toMatchObject({ solids: 1, faces: 6, valid: true });
    const call = runner.calls[0];
    expect(call.args).toContain("--network");
    expect(call.args[call.args.indexOf("--network") + 1]).toBe("none");
    expect(call.args).toContain("--read-only");
    expect(call.args).toContain("--cap-drop=ALL");
    expect(call.args).toContain("--security-opt=no-new-privileges");
    expect(call.args.some((arg) => arg.includes("dst=/artifacts,readonly"))).toBe(true);
    expect(call.args.some((arg) => arg.includes("dst=/validator,readonly"))).toBe(true);
    expect(call.stdin).toContain('"format":"STEP"');
    expect(call.stdin).toContain("/artifacts/source.step");
    expect(call.stdin).not.toContain("deterministic-source-geometry");
  });

  it("decodes bounded tessellation buffers into typed arrays with provenance", async () => {
    const { runner, executor } = await setup();
    runner.result = { ...runner.result, stdout: JSON.stringify(meshResponse()) };
    const result = await executor.tessellate(source(), {
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35
    });
    expect(Array.from(result.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(result.normals)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(Array.from(result.indices)).toEqual([0, 1, 2]);
    expect(result.sourceArtifactId).toBe("source-geometry-1");
    expect(result.providerId).toBe("occt.geometry-kernel");
  });

  it("rejects source digest mismatch before invoking Docker", async () => {
    const { runner, executor } = await setup();
    const invalid = { ...source(), sha256: "a".repeat(64) };
    await expect(executor.inspect(invalid)).rejects.toThrow("SHA-256 digest");
    expect(runner.calls).toHaveLength(0);
  });

  it("rejects non-mm inputs, invalid deflection and malformed worker buffers", async () => {
    const { runner, executor } = await setup();
    await expect(executor.inspect({ ...source(), units: "in" })).rejects.toThrow("millimetre");
    await expect(executor.tessellate(source(), { linearDeflectionMm: 10, angularDeflectionRad: 0.35 }))
      .rejects.toThrow("linearDeflectionMm");
    runner.result = { ...runner.result, stdout: JSON.stringify(meshResponse()).replace('"vertexCount":3', '"vertexCount":4') };
    await expect(executor.tessellate(source(), { linearDeflectionMm: 0.1, angularDeflectionRad: 0.35 }))
      .rejects.toThrow("buffer length");
  });

  it("returns typed adapter failures without upgrading geometry validation state", async () => {
    const { runner, executor } = await setup();
    const adapter = new DockerOCCTGeometryKernelAdapter(executor);
    const result = await adapter.inspect({ ...source(), sha256: "bad" });
    expect(result.status).toBe("FAILED");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(runner.calls).toHaveLength(0);
  });
});
