import { stat, realpath } from "node:fs/promises";
import path from "node:path";
import {
  CADCommandRunner,
  CADCommandRunOptions,
  NodeCADCommandRunner
} from "./docker-build123d-transport.js";
import { OcctExecutor } from "../providers/occt.js";

export interface DockerOCCTValidatorOptions {
  /** Pre-provisioned image containing the pinned build123d/OCP OpenCascade bindings. */
  image: string;
  /** Parent host directory containing retained CAD run directories. */
  artifactRoot: string;
  /** Trusted host-side path to worker/cad/occt/validate_brep.py. */
  workerScriptPath: string;
  dockerBinary?: string;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  maxArtifactBytes?: number;
  memoryLimit?: string;
  cpus?: number;
  pidsLimit?: number;
  runAsUid?: number;
  runAsGid?: number;
  runner?: CADCommandRunner;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_STDOUT_BYTES = 64_000;
const DEFAULT_MAX_STDERR_BYTES = 32_000;
const DEFAULT_MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const DEFAULT_MEMORY_LIMIT = "1g";
const DEFAULT_CPUS = 1;
const DEFAULT_PIDS_LIMIT = 64;
const CONTAINER_ARTIFACT_ROOT = "/artifacts";
const CONTAINER_VALIDATOR_ROOT = "/validator";

interface ValidationWorkerResult {
  valid: boolean;
  solidCount: number;
  checkedBy: string;
  warnings: string[];
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function withinDirectory(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateImage(value: string): string {
  const normalized = value.trim();
  if (!normalized || /[\r\n\0]/.test(normalized) || normalized.startsWith("-")) {
    throw new Error("OCCT validator image must be a non-empty trusted image reference.");
  }
  return normalized;
}

function mountPath(value: string, label: string): string {
  if (value.includes(",") || /[\r\n\0]/.test(value)) {
    throw new Error(label + " contains characters that are not supported by Docker --mount syntax.");
  }
  return value;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Runs OpenCascade BREP validation in a separate, no-network Docker process.
 * Only the exact CAD run directory is mounted read-only; no CAD source is executed.
 */
export class DockerOCCTValidatorExecutor implements OcctExecutor {
  private readonly image: string;
  private readonly artifactRoot: string;
  private readonly workerScriptPath: string;
  private readonly dockerBinary: string;
  private readonly timeoutMs: number;
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;
  private readonly maxArtifactBytes: number;
  private readonly memoryLimit: string;
  private readonly cpus: number;
  private readonly pidsLimit: number;
  private readonly runAsUid: number;
  private readonly runAsGid: number;
  private readonly runner: CADCommandRunner;

  constructor(private readonly options: DockerOCCTValidatorOptions) {
    this.image = validateImage(options.image);
    this.artifactRoot = path.resolve(options.artifactRoot);
    this.workerScriptPath = path.resolve(options.workerScriptPath);
    this.dockerBinary = options.dockerBinary ?? "docker";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
    this.maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    this.maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
    this.memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
    this.cpus = options.cpus ?? DEFAULT_CPUS;
    this.pidsLimit = options.pidsLimit ?? DEFAULT_PIDS_LIMIT;
    this.runAsUid = options.runAsUid ?? 10001;
    this.runAsGid = options.runAsGid ?? 10001;
    this.runner = options.runner ?? new NodeCADCommandRunner();

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) {
      throw new Error("OCCT validation timeout must be an integer from 100 through 120000 ms.");
    }
    if (!Number.isInteger(this.maxStdoutBytes) || this.maxStdoutBytes < 256 ||
        !Number.isInteger(this.maxStderrBytes) || this.maxStderrBytes < 0) {
      throw new Error("OCCT validator output limits are invalid.");
    }
    if (!Number.isInteger(this.maxArtifactBytes) || this.maxArtifactBytes < 1) {
      throw new Error("OCCT validator artifact size limit must be a positive integer.");
    }
    if (!Number.isFinite(this.cpus) || this.cpus <= 0 ||
        !Number.isInteger(this.pidsLimit) || this.pidsLimit < 1 ||
        !Number.isInteger(this.runAsUid) || this.runAsUid < 1 ||
        !Number.isInteger(this.runAsGid) || this.runAsGid < 1) {
      throw new Error("OCCT validator resource and identity limits are invalid.");
    }
    if (!/^[0-9]+(?:\.[0-9]+)?[kKmMgG]?$/.test(this.memoryLimit)) {
      throw new Error("OCCT validator memoryLimit must be a numeric Docker memory quantity.");
    }
    if (!this.dockerBinary.trim() || /[\r\n\0]/.test(this.dockerBinary)) {
      throw new Error("dockerBinary must be a trusted executable name or absolute path.");
    }
  }

  async call(operation: string, input: Record<string, unknown>): Promise<unknown> {
    if (operation !== "validate_geometry") {
      throw new Error("DockerOCCTValidatorExecutor supports validate_geometry only.");
    }
    if (!isRecord(input)) throw new Error("OCCT validation input must be an object.");
    for (const key of ["projectId", "artifactId", "modelIdentityId", "executionId", "providerId", "sourceSha256"]) {
      if (!nonEmptyString(input[key])) throw new Error("OCCT validation requires " + key + " provenance.");
    }
    if (input.backend !== "build123d") {
      throw new Error("The configured OCCT validator accepts build123d BREP artifacts only.");
    }
    if (!nonEmptyString(input.artifactUri)) throw new Error("OCCT validation requires a host artifact URI.");

    const [artifactRoot, artifactPath, scriptPath] = await Promise.all([
      realpath(this.artifactRoot),
      realpath(input.artifactUri),
      realpath(this.workerScriptPath)
    ]);
    if (!withinDirectory(artifactPath, artifactRoot) || artifactPath === artifactRoot) {
      throw new Error("OCCT validation artifact is outside the configured artifact root.");
    }
    if (path.extname(artifactPath).toLowerCase() !== ".brep") {
      throw new Error("OCCT validation accepts only .brep solids.");
    }
    const [artifactInfo, scriptInfo] = await Promise.all([stat(artifactPath), stat(scriptPath)]);
    if (!artifactInfo.isFile() || artifactInfo.size <= 0 || artifactInfo.size > this.maxArtifactBytes) {
      throw new Error("OCCT validation artifact is empty, not a regular file, or exceeds the configured size limit.");
    }
    if (!scriptInfo.isFile()) throw new Error("Configured OCCT worker script is not a regular file.");

    const artifactDirectory = mountPath(path.dirname(artifactPath), "Artifact directory");
    const scriptDirectory = mountPath(path.dirname(scriptPath), "Validator script directory");
    const scriptName = path.basename(scriptPath);

    const parameters = input.parameters;
    let expected: Record<string, unknown> | undefined;
    if (parameters !== undefined) {
      if (!isRecord(parameters)) throw new Error("OCCT validation parameters must be an object.");
      if (parameters.kind === "CYLINDER") {
        if (!finitePositive(parameters.diameterMm) || !finitePositive(parameters.lengthMm)) {
          throw new Error("Cylinder validation requires finite positive diameterMm and lengthMm.");
        }
        expected = {
          kind: "CYLINDER",
          diameterMm: parameters.diameterMm,
          lengthMm: parameters.lengthMm,
          toleranceMm: input.toleranceMm === undefined ? 0.01 : input.toleranceMm
        };
        if (!finitePositive(expected.toleranceMm) || (expected.toleranceMm as number) > 1) {
          throw new Error("OCCT validation tolerance must be greater than 0 and no more than 1 mm.");
        }
      }
    }

    const payload = JSON.stringify({
      artifactPath: CONTAINER_ARTIFACT_ROOT + "/" + path.basename(artifactPath),
      ...(expected ? { expected } : {})
    });
    const args = [
      "run", "--rm", "--interactive",
      "--network", "none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit", String(this.pidsLimit),
      "--memory", this.memoryLimit,
      "--cpus", String(this.cpus),
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
      "--user", this.runAsUid + ":" + this.runAsGid,
      "--mount", "type=bind,src=" + artifactDirectory + ",dst=" + CONTAINER_ARTIFACT_ROOT + ",readonly",
      "--mount", "type=bind,src=" + scriptDirectory + ",dst=" + CONTAINER_VALIDATOR_ROOT + ",readonly",
      "--entrypoint", "python",
      "--pull=never",
      this.image,
      CONTAINER_VALIDATOR_ROOT + "/" + scriptName
    ];
    const runOptions: CADCommandRunOptions = {
      timeoutMs: this.timeoutMs,
      maxStdoutBytes: this.maxStdoutBytes,
      maxStderrBytes: this.maxStderrBytes
    };
    const execution = await this.runner.run(this.dockerBinary, args, payload, runOptions);

    if (execution.timedOut) throw new Error("OCCT BREP validation timed out.");
    if (execution.outputLimitExceeded) throw new Error("OCCT BREP validator exceeded its output limit.");
    if (execution.error) throw new Error("OCCT BREP validator could not start: " + execution.error);
    if (execution.exitCode !== 0) {
      const diagnostic = execution.stderr.trim().slice(-2_000);
      throw new Error("OCCT BREP validator exited unsuccessfully." + (diagnostic ? " " + diagnostic : ""));
    }

    let result: unknown;
    try {
      result = JSON.parse(execution.stdout);
    } catch {
      throw new Error("OCCT BREP validator returned malformed JSON.");
    }
    if (!isRecord(result) || typeof result.valid !== "boolean" ||
        !Number.isInteger(result.solidCount) || (result.solidCount as number) < 0 ||
        !nonEmptyString(result.checkedBy) ||
        !Array.isArray(result.warnings) || result.warnings.some((warning) => typeof warning !== "string")) {
      throw new Error("OCCT BREP validator response did not match the validation contract.");
    }
    return result as ValidationWorkerResult;
  }
}
