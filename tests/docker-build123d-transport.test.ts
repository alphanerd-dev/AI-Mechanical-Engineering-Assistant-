import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CADCommandRunner, CADCommandRunOptions, CADCommandRunResult, DockerBuild123dWorkerTransport
} from "../src/execution/docker-build123d-transport.js";
import { CADExecutionRequest } from "../src/cad/execution.js";

class FakeRunner implements CADCommandRunner {
  calls: Array<{ command: string; args: string[]; stdin: string; options: CADCommandRunOptions }> = [];
  handler: (call: { command: string; args: string[]; stdin: string; options: CADCommandRunOptions }) => Promise<CADCommandRunResult>;

  constructor(handler?: (call: { command: string; args: string[]; stdin: string; options: CADCommandRunOptions }) => Promise<CADCommandRunResult>) {
    this.handler = handler ?? (async () => ({
      exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false, outputLimitExceeded: false
    }));
  }

  async run(command: string, args: string[], stdin: string, options: CADCommandRunOptions): Promise<CADCommandRunResult> {
    const call = { command, args, stdin, options };
    this.calls.push(call);
    return this.handler(call);
  }
}

const request: CADExecutionRequest = {
  id: "exec-test", backend: "build123d", source: "from build123d import *\n", filename: "part.py", timeoutMs: 1000
};
const roots: string[] = [];

async function newArtifactRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ama-build123d-transport-test-"));
  roots.push(root);
  return root;
}

function mountDirectory(args: string[]): string {
  const index = args.indexOf("--mount");
  if (index < 0) throw new Error("Docker mount was not configured.");
  const raw = args[index + 1];
  const marker = "type=bind,src=";
  const suffix = ",dst=/artifacts";
  if (!raw.startsWith(marker) || !raw.endsWith(suffix)) throw new Error("Unexpected mount argument.");
  return raw.slice(marker.length, -suffix.length);
}

function successResponse() {
  return JSON.stringify({
    success: true, backend: "build123d",
    sourceArtifactPath: "/artifacts/part.py",
    solidArtifactPath: "/artifacts/part.brep",
    stepArtifactPath: "/artifacts/part.step",
    stdout: "cad source ran", stderr: "", warnings: []
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DockerBuild123dWorkerTransport", () => {
  it("uses a constrained Docker process and maps actual artifact files back to host paths", async () => {
    const runner = new FakeRunner(async (call) => {
      const root = mountDirectory(call.args);
      const payload = JSON.parse(call.stdin);
      expect(payload.source).toBe(request.source);
      await writeFile(path.join(root, "part.py"), payload.source);
      await writeFile(path.join(root, "part.brep"), "solid");
      await writeFile(path.join(root, "part.step"), "step");
      return { exitCode: 0, signal: null, stdout: successResponse(), stderr: "", timedOut: false, outputLimitExceeded: false };
    });
    const root = await newArtifactRoot();
    const transport = new DockerBuild123dWorkerTransport({
      image: "local/build123d-worker:0.13.0", artifactRoot: root, runner, runAsUid: process.getuid?.() ?? 1001,
      runAsGid: process.getgid?.() ?? 1001
    });

    const result = await transport.run(request);
    expect(result.success).toBe(true);
    expect(result.sourceArtifactPath).toContain(path.join(root, "cad-run-"));
    expect(result.solidArtifactPath).toContain("part.brep");
    expect(await readFile(result.solidArtifactPath!, "utf8")).toBe("solid");

    const invocation = runner.calls[0];
    expect(invocation.command).toBe("docker");
    expect(invocation.args[invocation.args.indexOf("--network") + 1]).toBe("none");
    expect(invocation.args).toContain("--read-only");
    expect(invocation.args).toContain("--cap-drop=ALL");
    expect(invocation.args).toContain("--security-opt=no-new-privileges");
    expect(invocation.args).toContain("--pull=never");
    expect(invocation.args).not.toContain("--privileged");
    expect(invocation.args).not.toContain(request.source);
  });

  it("rejects paths that escape the artifact mount and removes the failed run directory", async () => {
    const runner = new FakeRunner(async (call) => {
      const root = mountDirectory(call.args);
      await writeFile(path.join(root, "part.py"), request.source);
      return {
        exitCode: 0, signal: null,
        stdout: JSON.stringify({ success: true, backend: "build123d", sourceArtifactPath: "/artifacts/part.py", solidArtifactPath: "/etc/passwd", warnings: [] }),
        stderr: "", timedOut: false, outputLimitExceeded: false
      };
    });
    const root = await newArtifactRoot();
    const transport = new DockerBuild123dWorkerTransport({
      image: "local/build123d-worker:0.13.0", artifactRoot: root, runner,
      runAsUid: process.getuid?.() ?? 1001, runAsGid: process.getgid?.() ?? 1001
    });

    const result = await transport.run(request);
    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the isolated /artifacts mount.");
    expect(await readdir(root)).toEqual([]);
  });

  it("fails closed on timeouts and attempts to stop the named container", async () => {
    const runner = new FakeRunner(async () => {
      if (runner.calls.length === 1) {
        return { exitCode: null, signal: "SIGKILL", stdout: "", stderr: "", timedOut: true, outputLimitExceeded: false };
      }
      return { exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false, outputLimitExceeded: false };
    });
    const root = await newArtifactRoot();
    const transport = new DockerBuild123dWorkerTransport({
      image: "local/build123d-worker:0.13.0", artifactRoot: root, runner,
      runAsUid: process.getuid?.() ?? 1001, runAsGid: process.getgid?.() ?? 1001
    });

    const result = await transport.run(request);
    expect(result.success).toBe(false);
    expect(result.error).toContain("host-enforced execution timeout");
    expect(runner.calls[1].args[0]).toBe("kill");
  });

  it("rejects oversized sources before contacting Docker", async () => {
    const runner = new FakeRunner();
    const transport = new DockerBuild123dWorkerTransport({
      image: "local/build123d-worker:0.13.0", artifactRoot: await newArtifactRoot(), runner,
      runAsUid: process.getuid?.() ?? 1001, runAsGid: process.getgid?.() ?? 1001
    });
    const result = await transport.run({ ...request, source: "x".repeat(250_001) });
    expect(result.success).toBe(false);
    expect(result.error).toContain("250000-byte");
    expect(runner.calls).toHaveLength(0);
  });

  it("rejects malformed worker JSON", async () => {
    const runner = new FakeRunner(async (call) => {
      const root = mountDirectory(call.args);
      await writeFile(path.join(root, "part.py"), request.source);
      return { exitCode: 0, signal: null, stdout: "warning, not JSON", stderr: "", timedOut: false, outputLimitExceeded: false };
    });
    const transport = new DockerBuild123dWorkerTransport({
      image: "local/build123d-worker:0.13.0", artifactRoot: await newArtifactRoot(), runner,
      runAsUid: process.getuid?.() ?? 1001, runAsGid: process.getgid?.() ?? 1001
    });
    const result = await transport.run(request);
    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid JSON");
  });

  it("rejects invalid roots and unsafe resource settings at configuration time", () => {
    expect(() => new DockerBuild123dWorkerTransport({
      image: "worker:tag", artifactRoot: path.parse(process.cwd()).root
    })).toThrow("cannot be a filesystem root");
    expect(() => new DockerBuild123dWorkerTransport({
      image: "worker:tag", artifactRoot: "/tmp/worker", pidsLimit: 1
    })).toThrow("pidsLimit");
  });
});
