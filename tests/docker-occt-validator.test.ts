import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CADCommandRunner,
  CADCommandRunOptions,
  CADCommandRunResult
} from "../src/execution/docker-build123d-transport.js";
import { DockerOCCTValidatorExecutor } from "../src/execution/docker-occt-validator.js";
import { createDockerOCCTValidationProvider } from "../src/providers/occt-docker.js";

class FakeRunner implements CADCommandRunner {
  calls: Array<{ command: string; args: string[]; stdin: string; options: CADCommandRunOptions }> = [];
  result: CADCommandRunResult = {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({
      valid: true,
      solidCount: 1,
      checkedBy: "occt.brepcheck",
      validatorVersion: "build123d-0.13.0/OCCT-BRepCheck",
      warnings: [],
      volumeMm3: 141371.6694,
      boundingBoxMm: { x: 30, y: 30, z: 200 },
      faceCount: 3,
      edgeCount: 3,
      dimensionChecks: []
    }),
    stderr: "",
    timedOut: false,
    outputLimitExceeded: false
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

async function setup() {
  const artifactRoot = await tempDir("ama-occt-artifacts-");
  const runDirectory = path.join(artifactRoot, "cad-run-1");
  await mkdir(runDirectory);
  const artifactPath = path.join(runDirectory, "part.brep");
  await writeFile(artifactPath, "BREP fixture");

  const scriptRoot = await tempDir("ama-occt-script-");
  const workerScriptPath = path.join(scriptRoot, "validate_brep.py");
  await writeFile(workerScriptPath, "# trusted worker fixture\n");

  const runner = new FakeRunner();
  const executor = new DockerOCCTValidatorExecutor({
    image: "local/ama-build123d:0.13.0",
    artifactRoot,
    workerScriptPath,
    runner
  });
  const input = {
    projectId: "project-shaft",
    artifactId: "shaft-solid-1",
    artifactKind: "SOLID",
    artifactUri: artifactPath,
    modelIdentityId: "model-shaft",
    executionId: "execution-shaft",
    providerId: "cad.build123d",
    sourceSha256: "a".repeat(64),
    backend: "build123d",
    parameters: { kind: "CYLINDER", diameterMm: 30, lengthMm: 200, units: "mm" }
  };
  return { artifactRoot, artifactPath, workerScriptPath, runner, executor, input };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DockerOCCTValidatorExecutor", () => {
  it("advertises only geometry validation for the Docker validator provider", () => {
    const provider = createDockerOCCTValidationProvider({
      image: "local/ama-build123d:0.13.0",
      artifactRoot: path.join(os.tmpdir(), "not-created-yet"),
      workerScriptPath: path.join(os.tmpdir(), "validate_brep.py")
    });
    expect(provider.id).toBe("cad.occt");
    expect(provider.capabilities).toEqual(["CAD.VALIDATE_GEOMETRY"]);
  });

  it("mounts only the specific artifact run read-only and invokes the isolated validator", async () => {
    const { artifactPath, runner, executor, input } = await setup();
    const result = await executor.call("validate_geometry", input);

    expect(result).toMatchObject({
      valid: true,
      solidCount: 1,
      checkedBy: "occt.brepcheck"
    });
    const call = runner.calls[0];
    expect(call.command).toBe("docker");
    expect(call.args).toContain("--network");
    expect(call.args[call.args.indexOf("--network") + 1]).toBe("none");
    expect(call.args).toContain("--read-only");
    expect(call.args).toContain("--cap-drop=ALL");
    expect(call.args).toContain("--security-opt=no-new-privileges");
    expect(call.args).toContain("--pull=never");
    const expectedUid = typeof process.getuid === "function" && process.getuid() > 0 ? process.getuid() : 10001;
    const expectedGid = typeof process.getgid === "function" && process.getgid() > 0 ? process.getgid() : 10001;
    expect(call.args[call.args.indexOf("--user") + 1]).toBe(expectedUid + ":" + expectedGid);
    expect(call.args).toContain("--entrypoint");
    expect(call.args[call.args.indexOf("--entrypoint") + 1]).toBe("python");
    expect(call.args.some((arg) => arg.includes("dst=/artifacts,readonly"))).toBe(true);
    expect(call.args.some((arg) => arg.includes("dst=/validator,readonly"))).toBe(true);
    expect(call.stdin).toContain('"artifactPath":"/artifacts/part.brep"');
    expect(call.stdin).not.toContain(artifactPath);
    expect(call.stdin).toContain('"diameterMm":30');
    expect(call.options.timeoutMs).toBeGreaterThan(0);
  });

  it("rejects an artifact outside the configured artifact root before invoking Docker", async () => {
    const { executor, runner, input } = await setup();
    const outside = path.join(await tempDir("ama-occt-outside-"), "outside.brep");
    await writeFile(outside, "outside");
    await expect(executor.call("validate_geometry", { ...input, artifactUri: outside }))
      .rejects.toThrow("outside the configured artifact root");
    expect(runner.calls).toHaveLength(0);
  });

  it("rejects a non-BREP artifact and malformed provenance", async () => {
    const { executor, runner, input, artifactPath } = await setup();
    await expect(executor.call("validate_geometry", { ...input, artifactUri: artifactPath.replace(".brep", ".step") }))
      .rejects.toThrow();
    await expect(executor.call("validate_geometry", { ...input, sourceSha256: "" }))
      .rejects.toThrow("sourceSha256 provenance");
    expect(runner.calls).toHaveLength(0);
  });

  it("fails closed on timeout, command failure, and malformed validator output", async () => {
    const { executor, runner, input } = await setup();

    runner.result = { ...runner.result, timedOut: true };
    await expect(executor.call("validate_geometry", input)).rejects.toThrow("timed out");

    runner.result = { ...runner.result, timedOut: false, exitCode: 1, stderr: "validation crash" };
    await expect(executor.call("validate_geometry", input)).rejects.toThrow("exited unsuccessfully");

    runner.result = { ...runner.result, exitCode: 0, stdout: "not-json" };
    await expect(executor.call("validate_geometry", input)).rejects.toThrow("malformed JSON");

    runner.result = { ...runner.result, stdout: JSON.stringify({ valid: true }) };
    await expect(executor.call("validate_geometry", input)).rejects.toThrow("did not match the validation contract");
  });

  it("rejects invalid operation, backend, and out-of-range tolerance", async () => {
    const { executor, runner, input } = await setup();
    await expect(executor.call("repair_geometry", input)).rejects.toThrow("supports validate_geometry only");
    await expect(executor.call("validate_geometry", { ...input, backend: "cadquery" })).rejects.toThrow("build123d BREP");
    await expect(executor.call("validate_geometry", { ...input, toleranceMm: 10 })).rejects.toThrow("tolerance");
    expect(runner.calls).toHaveLength(0);
  });
});
