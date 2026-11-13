import { createHash } from "node:crypto";
import { chmod, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateCADGeometrySource, type CADGeometrySource } from "../cad/geometry-kernel-contract.js";
import {
  CADCommandRunner,
  CADCommandRunOptions,
  NodeCADCommandRunner
} from "./docker-build123d-transport.js";

export interface DockerOCCTGeometryOptions {
  image: string;
  workerScriptPath: string;
  dockerBinary?: string;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  memoryLimit?: string;
  cpus?: number;
  pidsLimit?: number;
  runner?: CADCommandRunner;
}

const ARTIFACT_ROOT = "/artifacts";
const WORKER_ROOT = "/validator";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_STDOUT_BYTES = 40 * 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 32_000;

export interface CADGeometryExecutor {
  inspect(source: CADGeometrySource): Promise<{
    solids: number; shells: number; faces: number; edges: number; vertices: number; valid: boolean;
  }>;
  tessellate(source: CADGeometrySource, options: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }): Promise<{
    positions: Float32Array; normals: Float32Array; indices: Uint32Array;
    linearDeflectionMm: number; angularDeflectionRad: number;
    sourceArtifactId: string; sourceArtifactSha256: string;
    providerId: string; providerVersion: string;
  }>;
}

type GeometryOperation = "INSPECT" | "TESSELLATE";
type GeometryWorkerResponse = {
  status: "COMPLETED" | "FAILED";
  providerId: string;
  providerVersion: string;
  errors: string[];
  limitations: string[];
  topology?: {
    solids: number; shells: number; faces: number; edges: number; vertices: number; valid: boolean;
  };
  tessellation?: {
    vertexCount: number;
    triangleCount: number;
    positionsFloat32LE: string;
    normalsFloat32LE: string;
    indicesUint32LE: string;
    linearDeflectionMm: number;
    angularDeflectionRad: number;
    relativeDeflection: boolean;
    units: string;
    coordinateFrame: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validImage(value: string): string {
  const image = value.trim();
  if (!image || image.startsWith("-") || /[\r\n\0]/.test(image)) {
    throw new Error("OCCT geometry image must be a trusted image reference.");
  }
  return image;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateDeflection(options: { linearDeflectionMm: number; angularDeflectionRad: number }): void {
  if (!Number.isFinite(options.linearDeflectionMm) ||
      options.linearDeflectionMm < 0.001 || options.linearDeflectionMm > 5) {
    throw new Error("linearDeflectionMm must be between 0.001 and 5 mm.");
  }
  if (!Number.isFinite(options.angularDeflectionRad) ||
      options.angularDeflectionRad < 0.01 || options.angularDeflectionRad > Math.PI / 2) {
    throw new Error("angularDeflectionRad must be between 0.01 and pi/2 radians.");
  }
}

function decodeFloat32(value: string, expectedLength: number): Float32Array {
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength !== expectedLength * 4) throw new Error("OCCT mesh float buffer length is inconsistent.");
  const output = new Float32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) output[index] = bytes.readFloatLE(index * 4);
  if (!output.every(Number.isFinite)) throw new Error("OCCT mesh contains non-finite coordinates or normals.");
  return output;
}

function decodeUint32(value: string, expectedLength: number): Uint32Array {
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength !== expectedLength * 4) throw new Error("OCCT mesh index buffer length is inconsistent.");
  const output = new Uint32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) output[index] = bytes.readUInt32LE(index * 4);
  return output;
}

/** Executes real OCCT import/inspection/tessellation in a no-network, read-only container. */
export class DockerOCCTGeometryExecutor implements CADGeometryExecutor {
  private readonly image: string;
  private readonly scriptPath: string;
  private readonly dockerBinary: string;
  private readonly timeoutMs: number;
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;
  private readonly memoryLimit: string;
  private readonly cpus: number;
  private readonly pidsLimit: number;
  private readonly runner: CADCommandRunner;

  constructor(options: DockerOCCTGeometryOptions) {
    this.image = validImage(options.image);
    this.scriptPath = path.resolve(options.workerScriptPath);
    this.dockerBinary = options.dockerBinary ?? "docker";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
    this.maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    this.memoryLimit = options.memoryLimit ?? "1g";
    this.cpus = options.cpus ?? 1;
    this.pidsLimit = options.pidsLimit ?? 64;
    this.runner = options.runner ?? new NodeCADCommandRunner();

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) {
      throw new Error("OCCT geometry timeout must be an integer from 100 through 120000 ms.");
    }
    if (!Number.isInteger(this.maxStdoutBytes) || this.maxStdoutBytes < 1024 ||
        !Number.isInteger(this.maxStderrBytes) || this.maxStderrBytes < 0) {
      throw new Error("OCCT geometry output limits are invalid.");
    }
    if (!/^[0-9]+(?:\.[0-9]+)?[kKmMgG]?$/.test(this.memoryLimit) ||
        !Number.isFinite(this.cpus) || this.cpus <= 0 || this.cpus > 8 ||
        !Number.isInteger(this.pidsLimit) || this.pidsLimit < 16 || this.pidsLimit > 512) {
      throw new Error("OCCT geometry resource limits are invalid.");
    }
    if (!this.dockerBinary.trim() || /[\r\n\0]/.test(this.dockerBinary)) {
      throw new Error("dockerBinary must be a trusted executable name or absolute path.");
    }
  }

  async call(operation: GeometryOperation, source: CADGeometrySource, options?: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }): Promise<GeometryWorkerResponse> {
    const sourceErrors = validateCADGeometrySource(source);
    if (sourceErrors.length) throw new Error(sourceErrors.join("; "));
    if (!source || !(source.bytes instanceof Uint8Array) || source.bytes.byteLength < 1 ||
        source.bytes.byteLength > 100 * 1024 * 1024) {
      throw new Error("OCCT geometry source must contain 1 byte to 100 MiB.");
    }
    if (!/^[a-f0-9]{64}$/.test(source.sha256) || sha256(source.bytes) !== source.sha256) {
      throw new Error("OCCT geometry source bytes do not match the declared SHA-256 digest.");
    }
    if (source.units !== "mm" || source.coordinateFrame !== "MODEL") {
      throw new Error("The current OCCT geometry worker accepts millimetre model-frame sources only.");
    }
    if (operation === "TESSELLATE") {
      if (!options) throw new Error("Tessellation settings are required.");
      validateDeflection(options);
    }

    let tempRoot: string | undefined;
    try {
      const scriptPath = await realpath(this.scriptPath);
      if (!(await stat(scriptPath)).isFile()) throw new Error("Configured OCCT geometry worker is not a regular file.");
      const scriptDirectory = path.dirname(scriptPath);
      if (scriptDirectory.includes(",") || /[\r\n\0]/.test(scriptDirectory)) {
        throw new Error("OCCT geometry worker path cannot be represented safely in Docker mount syntax.");
      }

      tempRoot = await mkdtemp(path.join(os.tmpdir(), "ama-occt-geometry-"));
      await chmod(tempRoot, 0o755);
      const filename = source.format === "BREP" ? "source.brep" : "source.step";
      const hostArtifactPath = path.join(tempRoot, filename);
      await writeFile(hostArtifactPath, Buffer.from(source.bytes));
      await chmod(hostArtifactPath, 0o444);

      const payload = JSON.stringify({
        operation,
        format: source.format,
        artifactPath: ARTIFACT_ROOT + "/" + filename,
        ...(options ? {
          linearDeflectionMm: options.linearDeflectionMm,
          angularDeflectionRad: options.angularDeflectionRad
        } : {})
      });
      const hostUid = typeof process.getuid === "function" ? process.getuid() : undefined;
      const hostGid = typeof process.getgid === "function" ? process.getgid() : undefined;
      const uid = hostUid !== undefined && hostUid > 0 ? hostUid : 10001;
      const gid = hostGid !== undefined && hostGid > 0 ? hostGid : 10001;
      const args = [
        "run", "--rm", "--interactive", "--network", "none", "--read-only",
        "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--pids-limit", String(this.pidsLimit), "--memory", this.memoryLimit,
        "--cpus", String(this.cpus), "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
        "--user", uid + ":" + gid,
        "--mount", "type=bind,src=" + tempRoot + ",dst=" + ARTIFACT_ROOT + ",readonly",
        "--mount", "type=bind,src=" + scriptDirectory + ",dst=" + WORKER_ROOT + ",readonly",
        "--env", "CAD_ARTIFACT_DIR=" + ARTIFACT_ROOT,
        "--entrypoint", "python", "--pull=never", this.image,
        WORKER_ROOT + "/" + path.basename(scriptPath)
      ];
      const runOptions: CADCommandRunOptions = {
        timeoutMs: this.timeoutMs,
        maxStdoutBytes: this.maxStdoutBytes,
        maxStderrBytes: this.maxStderrBytes
      };
      const execution = await this.runner.run(this.dockerBinary, args, payload, runOptions);
      if (execution.timedOut) throw new Error("OCCT geometry operation timed out.");
      if (execution.outputLimitExceeded) throw new Error("OCCT geometry worker exceeded its output limit.");
      if (execution.error) throw new Error("OCCT geometry worker could not start: " + execution.error);
      if (execution.exitCode !== 0) {
        throw new Error("OCCT geometry worker exited unsuccessfully. " + execution.stderr.trim().slice(-2000));
      }
      let response: unknown;
      try { response = JSON.parse(execution.stdout); }
      catch { throw new Error("OCCT geometry worker returned malformed JSON."); }
      if (!isRecord(response) || response.status !== "COMPLETED" ||
          typeof response.providerId !== "string" || typeof response.providerVersion !== "string" ||
          !Array.isArray(response.errors) || !Array.isArray(response.limitations)) {
        const errors = isRecord(response) && Array.isArray(response.errors)
          ? response.errors.filter((value): value is string => typeof value === "string").join("; ")
          : "response did not satisfy the worker protocol";
        throw new Error("OCCT geometry operation failed: " + errors);
      }
      const typed = response as unknown as GeometryWorkerResponse;
      if (!typed.topology || ![typed.topology.solids, typed.topology.shells, typed.topology.faces,
        typed.topology.edges, typed.topology.vertices].every((value) => Number.isSafeInteger(value) && value >= 0) ||
        typeof typed.topology.valid !== "boolean") {
        throw new Error("OCCT geometry worker returned malformed topology metadata.");
      }
      return typed;
    } finally {
      if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async inspect(source: CADGeometrySource) {
    const response = await this.call("INSPECT", source);
    return response.topology!;
  }

  async tessellate(source: CADGeometrySource, options: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }) {
    const response = await this.call("TESSELLATE", source, options);
    const mesh = response.tessellation;
    if (!mesh || !Number.isSafeInteger(mesh.vertexCount) || mesh.vertexCount < 3 ||
        mesh.vertexCount > 750_000 || !Number.isSafeInteger(mesh.triangleCount) ||
        mesh.triangleCount < 1 || mesh.triangleCount > 250_000) {
      throw new Error("OCCT geometry worker returned invalid tessellation counts.");
    }
    const positions = decodeFloat32(mesh.positionsFloat32LE, mesh.vertexCount * 3);
    const normals = decodeFloat32(mesh.normalsFloat32LE, mesh.vertexCount * 3);
    const indices = decodeUint32(mesh.indicesUint32LE, mesh.triangleCount * 3);
    if (indices.some((index) => index >= mesh.vertexCount)) {
      throw new Error("OCCT geometry worker returned an out-of-range mesh index.");
    }
    return {
      positions, normals, indices,
      linearDeflectionMm: mesh.linearDeflectionMm,
      angularDeflectionRad: mesh.angularDeflectionRad,
      sourceArtifactId: source.artifactId,
      sourceArtifactSha256: source.sha256,
      providerId: response.providerId,
      providerVersion: response.providerVersion
    };
  }
}
