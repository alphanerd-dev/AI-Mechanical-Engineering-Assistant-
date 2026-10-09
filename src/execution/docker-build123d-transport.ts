import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, chown, mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { CADExecutionRequest, CADExecutionResult } from "../cad/execution.js";
import { CADWorkerTransport } from "./build123d-worker.js";

export interface CADCommandRunOptions {
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
}

export interface CADCommandRunResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  error?: string;
}

export interface CADCommandRunner {
  run(command: string, args: string[], stdin: string, options: CADCommandRunOptions): Promise<CADCommandRunResult>;
}

export interface DockerBuild123dWorkerOptions {
  /** Trusted, pre-provisioned image reference. Production deployments should pin an image digest. */
  image: string;
  /** Host directory for generated artifacts. Successful run directories are retained for downstream validation. */
  artifactRoot: string;
  /** Server-configured executable; never populated from an engineering request. */
  dockerBinary?: string;
  maxTimeoutMs?: number;
  maxRequestBytes?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  memoryLimit?: string;
  cpus?: number;
  pidsLimit?: number;
  runAsUid?: number;
  runAsGid?: number;
  /** Injectable process boundary for deterministic acceptance tests. */
  runner?: CADCommandRunner;
}

const DEFAULT_MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_REQUEST_BYTES = 260_000;
const DEFAULT_MAX_STDOUT_BYTES = 2_000_000;
const DEFAULT_MAX_STDERR_BYTES = 64_000;
const WORKER_SOURCE_LIMIT_BYTES = 250_000;
const DEFAULT_MEMORY_LIMIT = "2g";
const DEFAULT_CPUS = 2;
const DEFAULT_PIDS_LIMIT = 128;
const WORKER_ARTIFACT_ROOT = "/artifacts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown CAD worker transport error.";
}

function failure(error: string, warnings: string[] = []): CADExecutionResult {
  return { success: false, backend: "build123d", warnings, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWithinDirectory(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeFilename(value: string): string | undefined {
  const filename = path.posix.basename(value.replace(/\\/g, "/"));
  if (!filename || filename === "." || filename === ".." || /[\r\n\0]/.test(filename)) return undefined;
  if (!filename.toLowerCase().endsWith(".py")) return undefined;
  return filename;
}

export class NodeCADCommandRunner implements CADCommandRunner {
  run(command: string, args: string[], stdin: string, options: CADCommandRunOptions): Promise<CADCommandRunResult> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, args, {
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        resolve({
          exitCode: null, signal: null, stdout: "", stderr: "",
          timedOut: false, outputLimitExceeded: false, error: errorMessage(error)
        });
        return;
      }

      let settled = false;
      let timedOut = false;
      let outputLimitExceeded = false;
      let spawnError: string | undefined;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode, signal,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          timedOut, outputLimitExceeded,
          ...(spawnError ? { error: spawnError } : {})
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeoutMs);

      child.stdout.on("data", (raw: Buffer | string) => {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        const remaining = Math.max(0, options.maxStdoutBytes - stdoutBytes);
        if (remaining > 0) stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutBytes += chunk.length;
        if (stdoutBytes > options.maxStdoutBytes) {
          outputLimitExceeded = true;
          child.kill("SIGKILL");
        }
      });
      child.stderr.on("data", (raw: Buffer | string) => {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        const remaining = Math.max(0, options.maxStderrBytes - stderrBytes);
        if (remaining > 0) stderrChunks.push(chunk.subarray(0, remaining));
        stderrBytes += chunk.length;
      });
      child.once("error", (error) => {
        spawnError = error.message;
        finish(null, null);
      });
      child.once("close", (code, signal) => finish(code, signal));
      child.stdin.on("error", (error) => {
        if (error.code !== "EPIPE") spawnError = error.message;
      });
      child.stdin.end(stdin);
    });
  }
}

/**
 * Runs the repository's stdin/stdout build123d worker in an isolated Docker container.
 * Generated Python is never evaluated inside the Next.js or Node.js process.
 */
export class DockerBuild123dWorkerTransport implements CADWorkerTransport {
  private readonly image: string;
  private readonly artifactRoot: string;
  private readonly dockerBinary: string;
  private readonly maxTimeoutMs: number;
  private readonly maxRequestBytes: number;
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;
  private readonly memoryLimit: string;
  private readonly cpus: number;
  private readonly pidsLimit: number;
  private readonly configuredUid?: number;
  private readonly configuredGid?: number;
  private readonly runner: CADCommandRunner;

  constructor(options: DockerBuild123dWorkerOptions) {
    if (!nonEmptyString(options?.image) || options.image.trim().startsWith("-") || /[\r\n\0]/.test(options.image)) {
      throw new Error("A trusted build123d Docker image reference is required.");
    }
    if (!nonEmptyString(options?.artifactRoot) || !path.isAbsolute(options.artifactRoot)) {
      throw new Error("CAD artifactRoot must be an absolute host path.");
    }

    this.image = options.image.trim();
    this.artifactRoot = path.resolve(options.artifactRoot);
    if (this.artifactRoot === path.parse(this.artifactRoot).root) {
      throw new Error("CAD artifactRoot cannot be a filesystem root.");
    }
    this.dockerBinary = options.dockerBinary?.trim() || "docker";
    if (/[\r\n\0]/.test(this.dockerBinary)) throw new Error("dockerBinary contains invalid characters.");

    this.maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
    this.maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
    this.maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
    this.maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    this.memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
    this.cpus = options.cpus ?? DEFAULT_CPUS;
    this.pidsLimit = options.pidsLimit ?? DEFAULT_PIDS_LIMIT;
    this.configuredUid = options.runAsUid;
    this.configuredGid = options.runAsGid;
    this.runner = options.runner ?? new NodeCADCommandRunner();

    if (!Number.isInteger(this.maxTimeoutMs) || this.maxTimeoutMs < 1000 || this.maxTimeoutMs > 60_000) {
      throw new Error("maxTimeoutMs must be an integer between 1000 and 60000.");
    }
    if (!Number.isInteger(this.maxRequestBytes) || this.maxRequestBytes < 10_000 || this.maxRequestBytes > 1_000_000) {
      throw new Error("maxRequestBytes is outside the allowed range.");
    }
    if (!Number.isInteger(this.maxStdoutBytes) || this.maxStdoutBytes < 1024) {
      throw new Error("maxStdoutBytes must be an integer of at least 1024.");
    }
    if (!Number.isInteger(this.maxStderrBytes) || this.maxStderrBytes < 1024) {
      throw new Error("maxStderrBytes must be an integer of at least 1024.");
    }
    if (!/^[1-9][0-9]*(m|g)$/.test(this.memoryLimit)) {
      throw new Error("memoryLimit must be a positive Docker memory value such as 1024m or 2g.");
    }
    if (!Number.isFinite(this.cpus) || this.cpus <= 0 || this.cpus > 32) {
      throw new Error("cpus must be greater than zero and no more than 32.");
    }
    if (!Number.isInteger(this.pidsLimit) || this.pidsLimit < 16 || this.pidsLimit > 4096) {
      throw new Error("pidsLimit must be between 16 and 4096.");
    }
    for (const id of [this.configuredUid, this.configuredGid]) {
      if (id !== undefined && (!Number.isInteger(id) || id <= 0)) {
        throw new Error("Container UID/GID must be positive non-root integers.");
      }
    }
  }

  async run(request: CADExecutionRequest): Promise<CADExecutionResult> {
    let runDirectory: string | undefined;
    let containerName: string | undefined;
    let warnings: string[] = [];

    try {
      if (request?.backend !== "build123d") return failure("Docker build123d transport rejects unsupported backends.");
      if (!nonEmptyString(request.id)) return failure("CAD execution request id is required.");
      if (!nonEmptyString(request.source)) return failure("CAD source must be non-empty.");
      if (Buffer.byteLength(request.source, "utf8") > WORKER_SOURCE_LIMIT_BYTES) {
        return failure("CAD source exceeds the 250000-byte worker limit.");
      }
      const filename = safeFilename(request.filename);
      if (!filename) return failure("CAD source filename must be a simple Python filename.");
      if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0 || request.timeoutMs > this.maxTimeoutMs) {
        return failure("CAD timeout exceeds the host worker policy.");
      }

      const payload = JSON.stringify({ ...request, filename });
      if (Buffer.byteLength(payload, "utf8") > this.maxRequestBytes) {
        return failure("Serialized CAD worker request exceeds the configured request-size limit.");
      }

      const root = await this.prepareArtifactRoot();
      runDirectory = await mkdtemp(path.join(root, "cad-run-"));
      await this.prepareRunDirectoryOwnership(runDirectory);
      containerName = "ama-build123d-" + randomUUID().replace(/-/g, "").slice(0, 24);

      const args = [
        "run", "--rm", "--init", "--interactive", "--pull=never",
        "--name", containerName,
        "--label", "ai-mechanical-engineering-assistant.worker=build123d",
        "--network", "none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--cpus", String(this.cpus), "--memory", this.memoryLimit,
        "--pids-limit", String(this.pidsLimit), "--ulimit", "nofile=1024:1024",
        "--stop-timeout", "2", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--mount", "type=bind,src=" + runDirectory + ",dst=" + WORKER_ARTIFACT_ROOT + ",rw",
        "--env", "CAD_ARTIFACT_DIR=" + WORKER_ARTIFACT_ROOT,
        "--env", "HOME=/tmp",
        "--user", this.resolveContainerUser(),
        this.image
      ];

      const result = await this.runner.run(this.dockerBinary, args, payload, {
        timeoutMs: request.timeoutMs + 5000,
        maxStdoutBytes: this.maxStdoutBytes,
        maxStderrBytes: this.maxStderrBytes
      });
      if (result.timedOut) {
        await this.stopContainer(containerName);
        throw new Error("Docker build123d worker exceeded its host-enforced execution timeout.");
      }
      if (result.outputLimitExceeded) {
        await this.stopContainer(containerName);
        throw new Error("Docker build123d worker exceeded the stdout response-size limit.");
      }
      if (result.error) throw new Error("Could not start the Docker build123d worker: " + result.error);
      if (!result.stdout.trim()) {
        throw new Error("Docker build123d worker returned no JSON response. " + result.stderr.slice(0, 1000));
      }

      let response: unknown;
      try {
        response = JSON.parse(result.stdout);
      } catch {
        throw new Error("Docker build123d worker returned invalid JSON.");
      }
      if (!isRecord(response) || typeof response.success !== "boolean" || response.backend !== "build123d") {
        throw new Error("Docker build123d worker response does not satisfy the response contract.");
      }
      warnings = Array.isArray(response.warnings)
        ? response.warnings.filter((value): value is string => typeof value === "string")
        : ["Worker warnings were missing or malformed."];

      if (response.success !== true) {
        throw new Error(nonEmptyString(response.error) ? response.error : "Generated CAD program failed.");
      }
      if (result.exitCode !== 0) {
        throw new Error("Docker worker returned success with a non-zero process exit code.");
      }

      const output: CADExecutionResult = {
        success: true,
        backend: "build123d",
        warnings,
        ...(typeof response.stdout === "string" ? { stdout: response.stdout.slice(-20_000) } : {}),
        ...(typeof response.stderr === "string" ? { stderr: response.stderr.slice(-20_000) } : {})
      };
      const fields = [
        "sourceArtifactPath", "solidArtifactPath", "stepArtifactPath", "stlArtifactPath", "threeMfArtifactPath"
      ] as const;
      for (const field of fields) {
        const rawPath = response[field];
        if (rawPath === undefined || rawPath === null) continue;
        if (!nonEmptyString(rawPath)) throw new Error("Worker returned a malformed value for " + field + ".");
        output[field] = await this.resolveWorkerArtifactPath(rawPath, runDirectory);
      }
      if (!output.sourceArtifactPath) {
        throw new Error("Successful build123d execution did not return its source artifact.");
      }
      return output;
    } catch (error) {
      if (runDirectory) await this.removeRunDirectory(runDirectory);
      return failure(errorMessage(error), warnings);
    }
  }

  private async prepareArtifactRoot(): Promise<string> {
    await mkdir(this.artifactRoot, { recursive: true });
    const root = await realpath(this.artifactRoot);
    const info = await stat(root);
    if (!info.isDirectory() || root === path.parse(root).root) {
      throw new Error("CAD artifactRoot must resolve to a non-root directory.");
    }
    if (root.includes(",")) {
      throw new Error("CAD artifactRoot cannot contain commas because Docker mount syntax uses comma-separated options.");
    }
    return root;
  }

  private resolveContainerUser(): string {
    const hostUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    const hostGid = typeof process.getgid === "function" ? process.getgid() : undefined;
    const uid = this.configuredUid ?? hostUid;
    const gid = this.configuredGid ?? hostGid;
    if (uid === undefined || gid === undefined || uid <= 0 || gid <= 0) {
      throw new Error("A non-root container UID/GID must be available on this host.");
    }
    if (hostUid !== 0 && (uid !== hostUid || gid !== hostGid)) {
      throw new Error("Non-root hosts must run the CAD container using the same UID/GID as the host process.");
    }
    return String(uid) + ":" + String(gid);
  }

  private async prepareRunDirectoryOwnership(directory: string): Promise<void> {
    const hostUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    const hostGid = typeof process.getgid === "function" ? process.getgid() : undefined;
    const uid = this.configuredUid ?? hostUid;
    const gid = this.configuredGid ?? hostGid;
    if (uid === undefined || gid === undefined || uid <= 0 || gid <= 0) {
      throw new Error("Cannot create a writable artifact mount for a non-root container user.");
    }
    if (hostUid === 0 && (uid !== hostUid || gid !== hostGid)) await chown(directory, uid, gid);
    await chmod(directory, 0o700);
  }

  private async resolveWorkerArtifactPath(rawPath: string, runDirectory: string): Promise<string> {
    const normalized = path.posix.normalize(rawPath.replace(/\\/g, "/"));
    const prefix = WORKER_ARTIFACT_ROOT + "/";
    if (!normalized.startsWith(prefix)) {
      throw new Error("Worker returned an artifact path outside the isolated /artifacts mount.");
    }
    const relative = normalized.slice(prefix.length);
    if (!relative || relative.split("/").some((segment) => segment === ".." || segment === ".")) {
      throw new Error("Worker returned an unsafe artifact path.");
    }
    const candidate = path.resolve(runDirectory, relative);
    if (!isWithinDirectory(candidate, runDirectory)) {
      throw new Error("Worker returned an artifact path that escapes the allocated output directory.");
    }
    const resolved = await realpath(candidate);
    if (!isWithinDirectory(resolved, runDirectory)) {
      throw new Error("Worker artifact resolves outside the allocated output directory.");
    }
    if (!(await stat(resolved)).isFile()) throw new Error("Worker artifact is not a regular file.");
    return resolved;
  }

  private async stopContainer(containerName: string): Promise<void> {
    try {
      await this.runner.run(this.dockerBinary, ["kill", containerName], "", {
        timeoutMs: 3000, maxStdoutBytes: 16_000, maxStderrBytes: 16_000
      });
    } catch {
      // Best-effort cleanup; the timeout remains the authoritative execution result.
    }
  }

  private async removeRunDirectory(directory: string): Promise<void> {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      // A deployment-level retention job should monitor and clean leftovers.
    }
  }
}
