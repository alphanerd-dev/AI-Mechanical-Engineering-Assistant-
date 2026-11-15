import type { ExecutionBackend, ExecutionRequest } from "../../../src/execution/types.js";
import { validateFEACantileverBoxRequest } from "../../../src/fea/benchmark.js";
import { validateOpenFOAMLaminarChannelRequest } from "../../../src/cfd/validation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PYTHON_CAPABILITIES = new Set([
  "UNITS.CONVERT", "UNITS.CHECK_DIMENSIONS", "MATH.SYMBOLIC_SOLVE",
  "MATH.NUMERICAL_SOLVE", "MATH.OPTIMIZE"
]);
const SUPPORTED_BACKENDS = new Set<ExecutionBackend>([
  "typescript-safe", "python-worker", "fea-worker", "cfd-worker"
]);

export interface DurableExecutionInput {
  projectId: string;
  idempotencyKey: string;
  capability: string;
  backend: ExecutionBackend;
  inputs: Record<string, unknown>;
  requestedOutputs: string[];
  requestId: string;
  timeoutMs: number;
}
export interface DurableExecutionParseFailure {
  ok: false;
  error: string;
  status: number;
  code: string;
}
export interface DurableExecutionParseSuccess {
  ok: true;
  value: DurableExecutionInput;
}
export type DurableExecutionParseResult = DurableExecutionParseSuccess | DurableExecutionParseFailure;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failure(message: string, status: number, code: string): DurableExecutionParseFailure {
  return { ok: false, error: message, status, code };
}
function parseProjectId(value: unknown): string | DurableExecutionParseFailure {
  if (typeof value !== "string" || !UUID.test(value.trim())) {
    return failure("A valid projectId is required for durable execution.", 400, "PROJECT_ID_REQUIRED");
  }
  return value.trim();
}
function parseIdempotencyKey(value: string): string | DurableExecutionParseFailure {
  const key = value.trim();
  if (!IDEMPOTENCY.test(key)) {
    return failure("Provide an Idempotency-Key header containing 8-128 safe characters.", 400, "IDEMPOTENCY_KEY_REQUIRED");
  }
  return key;
}
function parseCapability(value: unknown): string | DurableExecutionParseFailure {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) {
    return failure("A supported capability name is required.", 400, "CAPABILITY_REQUIRED");
  }
  return value.trim();
}
function parseBackend(value: unknown): ExecutionBackend | DurableExecutionParseFailure {
  const candidate = value === undefined ? "typescript-safe" : value;
  if (typeof candidate !== "string" || !SUPPORTED_BACKENDS.has(candidate as ExecutionBackend)) {
    return failure("Backend must be typescript-safe, python-worker, fea-worker or cfd-worker.", 400, "UNSUPPORTED_BACKEND");
  }
  return candidate as ExecutionBackend;
}
type ValueParseResult<T> = { valid: true; value: T } | { valid: false; failure: DurableExecutionParseFailure };
function parseInputs(value: unknown): ValueParseResult<Record<string, unknown>> {
  if (value === undefined) return { valid: true, value: {} };
  if (!isRecord(value)) {
    return { valid: false, failure: failure("inputs must be a JSON object when provided.", 400, "INVALID_INPUTS") };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { valid: false, failure: failure("inputs must be JSON serializable.", 400, "INVALID_INPUTS") };
  }
  if (serialized.length > 64_000) {
    return { valid: false, failure: failure("inputs exceed the 64 KB request limit.", 413, "INPUT_TOO_LARGE") };
  }
  return { valid: true, value };
}
function parseRequestedOutputs(value: unknown): string[] | DurableExecutionParseFailure {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return failure("requestedOutputs must be an array when provided.", 400, "INVALID_OUTPUTS");
  if (value.length > 64 || value.some(item => typeof item !== "string" || !item.trim() || item.length > 128)) {
    return failure("requestedOutputs must contain at most 64 non-empty short strings.", 400, "INVALID_OUTPUTS");
  }
  return value as string[];
}
function validateBackendCapability(backend: ExecutionBackend, capability: string): DurableExecutionParseFailure | undefined {
  if (backend === "typescript-safe" && capability !== "ANALYSIS.SHAFT_TORQUE") {
    return failure("The TypeScript backend does not support this capability.", 422, "UNSUPPORTED_CAPABILITY");
  }
  if (backend === "python-worker" && !PYTHON_CAPABILITIES.has(capability)) {
    return failure("The Python worker capability is not allowlisted.", 422, "UNSUPPORTED_CAPABILITY");
  }
  if (backend === "fea-worker" && capability !== "ANALYSIS.STATIC_STRUCTURAL") {
    return failure("The CalculiX worker only supports ANALYSIS.STATIC_STRUCTURAL.", 422, "UNSUPPORTED_CAPABILITY");
  }
  if (backend === "cfd-worker" && capability !== "ANALYSIS.CFD_LAMINAR_CHANNEL") {
    return failure("The OpenFOAM worker only supports ANALYSIS.CFD_LAMINAR_CHANNEL.", 422, "UNSUPPORTED_CAPABILITY");
  }
  return undefined;
}
function validateWorkerConfiguration(backend: ExecutionBackend): DurableExecutionParseFailure | undefined {
  if (backend === "python-worker" && (!process.env.PYTHON_WORKER_URL || !process.env.PYTHON_WORKER_API_TOKEN?.trim())) {
    return failure("The Python worker URL and API token must both be configured.", 503, "WORKER_UNAVAILABLE");
  }
  if (backend === "fea-worker" && (!process.env.CALCULIX_WORKER_URL || !process.env.CALCULIX_WORKER_API_TOKEN?.trim())) {
    return failure("The CalculiX worker URL and API token must both be configured.", 503, "WORKER_UNAVAILABLE");
  }
  if (backend === "cfd-worker" && (!process.env.OPENFOAM_WORKER_URL || !process.env.OPENFOAM_WORKER_API_TOKEN?.trim())) {
    return failure("The OpenFOAM worker URL and API token must both be configured.", 503, "WORKER_UNAVAILABLE");
  }
  return undefined;
}
function validateSolverInputs(backend: ExecutionBackend, inputs: Record<string, unknown>): DurableExecutionParseFailure | undefined {
  const errors = backend === "fea-worker"
    ? validateFEACantileverBoxRequest(inputs)
    : backend === "cfd-worker"
      ? validateOpenFOAMLaminarChannelRequest(inputs)
      : [];
  if (!errors.length) return undefined;
  const solverName = backend === "fea-worker" ? "CalculiX" : "OpenFOAM";
  return failure("Invalid " + solverName + " benchmark request: " + errors.join("; "), 422, "INVALID_SOLVER_REQUEST");
}
function timeoutForBackend(backend: ExecutionBackend, inputs: Record<string, unknown>): number {
  if (backend === "python-worker") return 30_000;
  if (backend === "fea-worker") return 120_000;
  if (backend === "cfd-worker") {
    const solver = isRecord(inputs.solver) ? inputs.solver : {};
    const seconds = typeof solver.timeoutSeconds === "number" ? solver.timeoutSeconds : 600;
    return (seconds + 120) * 1000;
  }
  return 2_000;
}
function requestedOutputsForBackend(backend: ExecutionBackend, outputs: string[]): string[] {
  if (backend === "fea-worker") return ["DISPLACEMENT", "STRESS", "REACTION_FORCE"];
  if (backend === "cfd-worker") return ["VELOCITY_PROFILE", "MASS_FLOW", "RESIDUALS", "ARTIFACTS"];
  return outputs;
}
export function parseDurableExecutionInput(input: {
  body: Record<string, unknown>;
  idempotencyKey: string;
  requestId: string;
}): DurableExecutionParseResult {
  const projectId = parseProjectId(input.body.projectId);
  if (typeof projectId !== "string") return projectId;
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  if (typeof idempotencyKey !== "string") return idempotencyKey;
  const capability = parseCapability(input.body.capability);
  if (typeof capability !== "string") return capability;
  const backend = parseBackend(input.body.backend);
  if (typeof backend !== "string") return backend;
  const backendCapabilityError = validateBackendCapability(backend, capability);
  if (backendCapabilityError) return backendCapabilityError;
  const workerConfigurationError = validateWorkerConfiguration(backend);
  if (workerConfigurationError) return workerConfigurationError;
  const parsedInputs = parseInputs(input.body.inputs);
  if (!parsedInputs.valid) return parsedInputs.failure;
  const inputs = parsedInputs.value;
  const outputs = parseRequestedOutputs(input.body.requestedOutputs);
  if (!Array.isArray(outputs)) return outputs;
  const solverInputError = validateSolverInputs(backend, inputs);
  if (solverInputError) return solverInputError;
  return {
    ok: true,
    value: {
      projectId,
      idempotencyKey,
      capability,
      backend,
      inputs,
      requestedOutputs: requestedOutputsForBackend(backend, outputs),
      requestId: input.requestId,
      timeoutMs: timeoutForBackend(backend, inputs)
    }
  };
}
export function buildDurableExecutionRequest(input: DurableExecutionInput, jobId: string): ExecutionRequest {
  return {
    id: jobId,
    capability: input.capability,
    backend: input.backend,
    inputs: input.inputs,
    requestedOutputs: input.requestedOutputs,
    timeoutMs: input.timeoutMs,
    projectId: input.projectId,
    correlationId: input.requestId
  };
}
