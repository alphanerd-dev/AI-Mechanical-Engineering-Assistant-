import { createHash } from "node:crypto";
import { chmod, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateCADGeometrySource, type CADGeometrySource } from "../cad/geometry-kernel-contract.js";
import {
  NodeCADCommandRunner,
  type CADCommandRunner,
  type CADCommandRunOptions
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
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_VERTICES = 750_000;
const MAX_TRIANGLES = 250_000;

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

interface PreparedGeometrySandbox {
  root: string;
  args: string[];
  payload: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeImageReference(image: string): boolean {
  return image.length > 0 && !image.startsWith("-") && !/[\r\n\0]/.test(image);
}

function validImage(value: string): string {
  const image = value.trim();
  if (!isSafeImageReference(image)) throw new Error("OCCT geometry image must be a trusted image reference.");
  return image;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateLinearDeflection(value: number): void {
  if (!Number.isFinite(value)) throw new Error("linearDeflectionMm must be finite.");
  if (value < 0.001) throw new Error("linearDeflectionMm must be between 0.001 and 5 mm.");
  if (value > 5) throw new Error("linearDeflectionMm must be between 0.001 and 5 mm.");
}

function validateAngularDeflection(value: number): void {
  if (!Number.isFinite(value)) throw new Error("angularDeflectionRad must be finite.");
  if (value < 0.01) throw new Error("angularDeflectionRad must be between 0.01 and pi/2 radians.");
  if (value > Math.PI / 2) throw new Error("angularDeflectionRad must be between 0.01 and pi/2 radians.");
}

function validateDeflection(options: { linearDeflectionMm: number; angularDeflectionRad: number }): void {
  validateLinearDeflection(options.linearDeflectionMm);
  validateAngularDeflection(options.angularDeflectionRad);
}

function validateGeometrySourceContract(source: CADGeometrySource): void {
  const errors = validateCADGeometrySource(source);
  if (errors.length) throw new Error(errors.join("; "));
  if (source.units !== "mm" || source.coordinateFrame !== "MODEL") {
    throw new Error("The current OCCT geometry worker accepts millimetre model-frame sources only.");
  }
}

function validateGeometrySourceByteLength(bytes: Uint8Array): void {
  if (bytes.byteLength < 1) throw new Error("OCCT geometry source must contain 1 byte to 100 MiB.");
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("OCCT geometry source must contain 1 byte to 100 MiB.");
}

function validateGeometrySourceDigest(source: CADGeometrySource): void {
  if (!/^[a-f0-9]{64}$/.test(source.sha256)) {
    throw new Error("OCCT geometry source bytes do not match the declared SHA-256 digest.");
  }
  if (sha256(source.bytes) !== source.sha256) {
    throw new Error("OCCT geometry source bytes do not match the declared SHA-256 digest.");
  }
}

function validateGeometrySourceBytes(source: CADGeometrySource): void {
  if (!(source.bytes instanceof Uint8Array)) throw new Error("OCCT geometry source must contain 1 byte to 100 MiB.");
  validateGeometrySourceByteLength(source.bytes);
  validateGeometrySourceDigest(source);
}

function validateGeometryOperationOptions(operation: GeometryOperation, options?: {
  linearDeflectionMm: number; angularDeflectionRad: number;
}): void {
  if (operation !== "TESSELLATE") return;
  if (!options) throw new Error("Tessellation settings are required.");
  validateDeflection(options);
}

function validateGeometrySource(source: CADGeometrySource, operation: GeometryOperation, options?: {
  linearDeflectionMm: number; angularDeflectionRad: number;
}): void {
  validateGeometrySourceContract(source);
  validateGeometrySourceBytes(source);
  validateGeometryOperationOptions(operation, options);
}

interface DockerArgumentOptions {
  image: string;
  root: string;
  scriptDirectory: string;
  scriptPath: string;
  limits: { pidsLimit: number; memoryLimit: string; cpus: number };
}

function buildDockerArgs(input: DockerArgumentOptions): string[] {
  const { image, root, scriptDirectory, scriptPath, limits } = input;
  const hostUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const hostGid = typeof process.getgid === "function" ? process.getgid() : undefined;
  const uid = hostUid !== undefined && hostUid > 0 ? hostUid : 10001;
  const gid = hostGid !== undefined && hostGid > 0 ? hostGid : 10001;
  return [
    "run", "--rm", "--interactive", "--network", "none", "--read-only",
    "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--pids-limit", String(limits.pidsLimit), "--memory", limits.memoryLimit,
    "--cpus", String(limits.cpus), "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
    "--user", uid + ":" + gid,
    "--mount", "type=bind,src=" + root + ",dst=" + ARTIFACT_ROOT + ",readonly",
    "--mount", "type=bind,src=" + scriptDirectory + ",dst=" + WORKER_ROOT + ",readonly",
    "--env", "CAD_ARTIFACT_DIR=" + ARTIFACT_ROOT,
    "--entrypoint", "python", "--pull=never", image,
    WORKER_ROOT + "/" + path.basename(scriptPath)
  ];
}

interface GeometrySandboxRequest {
  scriptPathInput: string;
  image: string;
  source: CADGeometrySource;
  operation: GeometryOperation;
  options?: { linearDeflectionMm: number; angularDeflectionRad: number };
  limits: { pidsLimit: number; memoryLimit: string; cpus: number };
}

async function resolveGeometryWorkerScript(scriptPathInput: string): Promise<{ scriptPath: string; scriptDirectory: string }> {
  const scriptPath = await realpath(scriptPathInput);
  if (!(await stat(scriptPath)).isFile()) throw new Error("Configured OCCT geometry worker is not a regular file.");
  const scriptDirectory = path.dirname(scriptPath);
  if (scriptDirectory.includes(",") || /[\r\n\0]/.test(scriptDirectory)) {
    throw new Error("OCCT geometry worker path cannot be represented safely in Docker mount syntax.");
  }
  return { scriptPath, scriptDirectory };
}

async function createGeometryArtifactRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ama-occt-geometry-"));
  await chmod(root, 0o755);
  return root;
}

async function writeGeometrySource(root: string, source: CADGeometrySource): Promise<string> {
  const filename = source.format === "BREP" ? "source.brep" : "source.step";
  const sourcePath = path.join(root, filename);
  await writeFile(sourcePath, Buffer.from(source.bytes));
  await chmod(sourcePath, 0o444);
  return filename;
}

function createGeometryWorkerPayload(
  source: CADGeometrySource,
  operation: GeometryOperation,
  options?: { linearDeflectionMm: number; angularDeflectionRad: number }
): string {
  return JSON.stringify({
    operation, format: source.format, artifactPath: ARTIFACT_ROOT + "/" + (source.format === "BREP" ? "source.brep" : "source.step"),
    ...(options ? { linearDeflectionMm: options.linearDeflectionMm, angularDeflectionRad: options.angularDeflectionRad } : {})
  });
}

async function prepareGeometrySandbox(input: GeometrySandboxRequest): Promise<PreparedGeometrySandbox> {
  const { scriptPath, scriptDirectory } = await resolveGeometryWorkerScript(input.scriptPathInput);
  const root = await createGeometryArtifactRoot();
  try {
    await writeGeometrySource(root, input.source);
    const payload = createGeometryWorkerPayload(input.source, input.operation, input.options);
    const args = buildDockerArgs({
      image: input.image, root, scriptDirectory, scriptPath, limits: input.limits
    });
    return { root, args, payload };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function parseWorkerJson(stdout: string): unknown {
  try { return JSON.parse(stdout); }
  catch { throw new Error("OCCT geometry worker returned malformed JSON."); }
}

function workerFailureDetail(response: unknown): string {
  if (isRecord(response) && Array.isArray(response.errors)) {
    return response.errors.filter((value): value is string => typeof value === "string").join("; ");
  }
  return "response did not satisfy the worker protocol";
}

function validateWorkerEnvelope(response: unknown): asserts response is GeometryWorkerResponse {
  if (!isRecord(response)) throw new Error("OCCT geometry worker returned a non-object response.");
  const valid = response.status === "COMPLETED" &&
    typeof response.providerId === "string" &&
    typeof response.providerVersion === "string" &&
    Array.isArray(response.errors) && Array.isArray(response.limitations);
  if (!valid) throw new Error("OCCT geometry operation failed: " + workerFailureDetail(response));
}

function validateWorkerTopology(topology: GeometryWorkerResponse["topology"]): void {
  if (!topology) throw new Error("OCCT geometry worker omitted topology metadata.");
  const counts = [topology.solids, topology.shells, topology.faces, topology.edges, topology.vertices];
  if (!counts.every((value) => Number.isSafeInteger(value) && value >= 0) || typeof topology.valid !== "boolean") {
    throw new Error("OCCT geometry worker returned malformed topology metadata.");
  }
}

function parseGeometryWorkerResponse(stdout: string): GeometryWorkerResponse {
  const response = parseWorkerJson(stdout);
  validateWorkerEnvelope(response);
  validateWorkerTopology(response.topology);
  return response;
}

interface GeometryBufferDecodeInput {
  base64: string;
  expectedLength: number;
}

function decodeFloat32(input: GeometryBufferDecodeInput): Float32Array {
  const { base64, expectedLength } = input;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength !== expectedLength * 4) throw new Error("OCCT mesh float buffer length is inconsistent.");
  const output = new Float32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) output[index] = bytes.readFloatLE(index * 4);
  if (!output.every(Number.isFinite)) throw new Error("OCCT mesh contains non-finite coordinates or normals.");
  return output;
}

function decodeUint32(input: GeometryBufferDecodeInput): Uint32Array {
  const { base64, expectedLength } = input;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength !== expectedLength * 4) throw new Error("OCCT mesh index buffer length is inconsistent.");
  const output = new Uint32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) output[index] = bytes.readUInt32LE(index * 4);
  return output;
}

function validateTessellationVertexCount(vertexCount: number): void {
  if (!Number.isSafeInteger(vertexCount)) throw new Error("OCCT geometry worker returned invalid tessellation counts.");
  if (vertexCount < 3 || vertexCount > MAX_VERTICES) throw new Error("OCCT geometry worker returned invalid tessellation counts.");
}

function validateTessellationTriangleCount(triangleCount: number): void {
  if (!Number.isSafeInteger(triangleCount)) throw new Error("OCCT geometry worker returned invalid tessellation counts.");
  if (triangleCount < 1 || triangleCount > MAX_TRIANGLES) throw new Error("OCCT geometry worker returned invalid tessellation counts.");
}

function validateTessellationCounts(mesh: NonNullable<GeometryWorkerResponse["tessellation"]>): void {
  validateTessellationVertexCount(mesh.vertexCount);
  validateTessellationTriangleCount(mesh.triangleCount);
}

function decodeTessellationBuffers(mesh: NonNullable<GeometryWorkerResponse["tessellation"]>) {
  const positions = decodeFloat32({ base64: mesh.positionsFloat32LE, expectedLength: mesh.vertexCount * 3 });
  const normals = decodeFloat32({ base64: mesh.normalsFloat32LE, expectedLength: mesh.vertexCount * 3 });
  const indices = decodeUint32({ base64: mesh.indicesUint32LE, expectedLength: mesh.triangleCount * 3 });
  if (indices.some((index) => index >= mesh.vertexCount)) {
    throw new Error("OCCT geometry worker returned an out-of-range mesh index.");
  }
  return { positions, normals, indices };
}

function decodeTessellation(response: GeometryWorkerResponse, source: CADGeometrySource) {
  const mesh = response.tessellation;
  if (!mesh) throw new Error("OCCT geometry worker omitted tessellation.");
  validateTessellationCounts(mesh);
  return {
    ...decodeTessellationBuffers(mesh),
    linearDeflectionMm: mesh.linearDeflectionMm,
    angularDeflectionRad: mesh.angularDeflectionRad,
    sourceArtifactId: source.artifactId,
    sourceArtifactSha256: source.sha256,
    providerId: response.providerId,
    providerVersion: response.providerVersion
  };
}

interface ResolvedDockerGeometryOptions {
  image: string;
  scriptPath: string;
  dockerBinary: string;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  memoryLimit: string;
  cpus: number;
  pidsLimit: number;
  runner: CADCommandRunner;
}

function validateGeometryTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs)) throw new Error("OCCT geometry timeout must be an integer from 100 through 120000 ms.");
  if (timeoutMs < 100) throw new Error("OCCT geometry timeout must be an integer from 100 through 120000 ms.");
  if (timeoutMs > 120_000) throw new Error("OCCT geometry timeout must be an integer from 100 through 120000 ms.");
}

function validateStdoutLimit(stdoutBytes: number): void {
  if (!Number.isInteger(stdoutBytes)) throw new Error("OCCT geometry output limits are invalid.");
  if (stdoutBytes < 1024) throw new Error("OCCT geometry output limits are invalid.");
}

function validateStderrLimit(stderrBytes: number): void {
  if (!Number.isInteger(stderrBytes)) throw new Error("OCCT geometry output limits are invalid.");
  if (stderrBytes < 0) throw new Error("OCCT geometry output limits are invalid.");
}

function validateGeometryOutputLimits(stdoutBytes: number, stderrBytes: number): void {
  validateStdoutLimit(stdoutBytes);
  validateStderrLimit(stderrBytes);
}

function resolveExecutionLimits(options: DockerOCCTGeometryOptions) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
  validateGeometryTimeout(timeoutMs);
  validateGeometryOutputLimits(maxStdoutBytes, maxStderrBytes);
  return { timeoutMs, maxStdoutBytes, maxStderrBytes };
}

function validateMemoryLimit(memoryLimit: string): void {
  if (!/^[0-9]+(?:\.[0-9]+)?[kKmMgG]?$/.test(memoryLimit)) {
    throw new Error("OCCT geometry resource limits are invalid.");
  }
}

function validateCPUCount(cpus: number): void {
  if (!Number.isFinite(cpus)) throw new Error("OCCT geometry resource limits are invalid.");
  if (cpus <= 0 || cpus > 8) throw new Error("OCCT geometry resource limits are invalid.");
}

function validatePIDLimit(pidsLimit: number): void {
  if (!Number.isInteger(pidsLimit)) throw new Error("OCCT geometry resource limits are invalid.");
  if (pidsLimit < 16 || pidsLimit > 512) throw new Error("OCCT geometry resource limits are invalid.");
}

function resolveContainerLimits(options: DockerOCCTGeometryOptions) {
  const memoryLimit = options.memoryLimit ?? "1g";
  const cpus = options.cpus ?? 1;
  const pidsLimit = options.pidsLimit ?? 64;
  validateMemoryLimit(memoryLimit);
  validateCPUCount(cpus);
  validatePIDLimit(pidsLimit);
  return { memoryLimit, cpus, pidsLimit };
}

function resolveDockerBinary(options: DockerOCCTGeometryOptions): string {
  const dockerBinary = options.dockerBinary ?? "docker";
  if (!dockerBinary.trim() || /[\r\n\0]/.test(dockerBinary)) {
    throw new Error("dockerBinary must be a trusted executable name or absolute path.");
  }
  return dockerBinary;
}

function resolveDockerGeometryOptions(options: DockerOCCTGeometryOptions): ResolvedDockerGeometryOptions {
  return {
    image: validImage(options.image),
    scriptPath: path.resolve(options.workerScriptPath),
    dockerBinary: resolveDockerBinary(options),
    ...resolveExecutionLimits(options),
    ...resolveContainerLimits(options),
    runner: options.runner ?? new NodeCADCommandRunner()
  };
}

type GeometryCommandResult = Awaited<ReturnType<CADCommandRunner["run"]>>;

function assertGeometryDidNotTimeOut(execution: GeometryCommandResult): void {
  if (execution.timedOut) throw new Error("OCCT geometry operation timed out.");
}

function assertGeometryOutputWithinLimit(execution: GeometryCommandResult): void {
  if (execution.outputLimitExceeded) throw new Error("OCCT geometry worker exceeded its output limit.");
}

function assertGeometryRunnerStarted(execution: GeometryCommandResult): void {
  if (execution.error) throw new Error("OCCT geometry worker could not start: " + execution.error);
}

function assertGeometryProcessSucceeded(execution: GeometryCommandResult): void {
  if (execution.exitCode !== 0) {
    throw new Error("OCCT geometry worker exited unsuccessfully. " + execution.stderr.trim().slice(-2000));
  }
}

function assertGeometryCommandSucceeded(execution: GeometryCommandResult): void {
  assertGeometryDidNotTimeOut(execution);
  assertGeometryOutputWithinLimit(execution);
  assertGeometryRunnerStarted(execution);
  assertGeometryProcessSucceeded(execution);
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
    const resolved = resolveDockerGeometryOptions(options);
    this.image = resolved.image;
    this.scriptPath = resolved.scriptPath;
    this.dockerBinary = resolved.dockerBinary;
    this.timeoutMs = resolved.timeoutMs;
    this.maxStdoutBytes = resolved.maxStdoutBytes;
    this.maxStderrBytes = resolved.maxStderrBytes;
    this.memoryLimit = resolved.memoryLimit;
    this.cpus = resolved.cpus;
    this.pidsLimit = resolved.pidsLimit;
    this.runner = resolved.runner;
  }

  private async executeSandbox(sandbox: PreparedGeometrySandbox): Promise<GeometryWorkerResponse> {
    const runOptions: CADCommandRunOptions = {
      timeoutMs: this.timeoutMs, maxStdoutBytes: this.maxStdoutBytes, maxStderrBytes: this.maxStderrBytes
    };
    const execution = await this.runner.run(this.dockerBinary, sandbox.args, sandbox.payload, runOptions);
    assertGeometryCommandSucceeded(execution);
    return parseGeometryWorkerResponse(execution.stdout);
  }

  async call(operation: GeometryOperation, source: CADGeometrySource, options?: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }): Promise<GeometryWorkerResponse> {
    validateGeometrySource(source, operation, options);
    const sandbox = await prepareGeometrySandbox({
      scriptPathInput: this.scriptPath,
      image: this.image,
      source,
      operation,
      options,
      limits: { pidsLimit: this.pidsLimit, memoryLimit: this.memoryLimit, cpus: this.cpus }
    });
    try {
      return await this.executeSandbox(sandbox);
    } finally {
      await rm(sandbox.root, { recursive: true, force: true });
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
    return decodeTessellation(response, source);
  }
}
