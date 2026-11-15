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
  projectId: string; idempotencyKey: string; capability: string; backend: ExecutionBackend;
  inputs: Record<string, unknown>; requestedOutputs: string[]; requestId: string; timeoutMs: number;
}
export interface DurableExecutionParseFailure { ok: false; error: string; status: number; code: string; }
export interface DurableExecutionParseSuccess { ok: true; value: DurableExecutionInput; }
export type DurableExecutionParseResult = DurableExecutionParseSuccess | DurableExecutionParseFailure;
interface ValueParseResult<T> {
  valid: boolean;
  value?: T;
  failure?: DurableExecutionParseFailure;
}
interface ParsedIdentity {
  projectId: string; idempotencyKey: string; capability: string; backend: ExecutionBackend;
  requestId: string;
}
interface ParsedPayload {
  inputs: Record<string, unknown>; requestedOutputs: string[]; timeoutMs: number;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failure(message: string, status: number, code: string): DurableExecutionParseFailure {
  return { ok: false, error: message, status, code };
}
function isFailure(value: unknown): value is DurableExecutionParseFailure {
  if (!isRecord(value)) return false;
  return value.ok === false && typeof value.error === "string" &&
    typeof value.status === "number" && typeof value.code === "string";
}
function parsed<T>(value: T): ValueParseResult<T> { return { valid: true, value }; }
function rejected<T>(value: DurableExecutionParseFailure): ValueParseResult<T> { return { valid: false, failure: value }; }

function parseProjectId(value: unknown): string | DurableExecutionParseFailure {
  if (typeof value !== "string") return failure("A valid projectId is required for durable execution.", 400, "PROJECT_ID_REQUIRED");
  const candidate = value.trim();
  if (!UUID.test(candidate)) return failure("A valid projectId is required for durable execution.", 400, "PROJECT_ID_REQUIRED");
  return candidate;
}
function parseIdempotencyKey(value: string): string | DurableExecutionParseFailure {
  const key = value.trim();
  if (!IDEMPOTENCY.test(key)) {
    return failure("Provide an Idempotency-Key header containing 8-128 safe characters.", 400, "IDEMPOTENCY_KEY_REQUIRED");
  }
  return key;
}
function parseCapability(value: unknown): string | DurableExecutionParseFailure {
  if (typeof value !== "string") return failure("A supported capability name is required.", 400, "CAPABILITY_REQUIRED");
  const candidate = value.trim();
  if (!candidate) return failure("A supported capability name is required.", 400, "CAPABILITY_REQUIRED");
  if (candidate.length > 128) return failure("A supported capability name is required.", 400, "CAPABILITY_REQUIRED");
  return candidate;
}
function parseBackend(value: unknown): ExecutionBackend | DurableExecutionParseFailure {
  const candidate = value === undefined ? "typescript-safe" : value;
  if (typeof candidate !== "string") return failure("Backend must be typescript-safe, python-worker, fea-worker or cfd-worker.", 400, "UNSUPPORTED_BACKEND");
  if (!SUPPORTED_BACKENDS.has(candidate as ExecutionBackend)) {
    return failure("Backend must be typescript-safe, python-worker, fea-worker or cfd-worker.", 400, "UNSUPPORTED_BACKEND");
  }
  return candidate as ExecutionBackend;
}
function validatePythonCapability(capability: string): DurableExecutionParseFailure | undefined {
  return PYTHON_CAPABILITIES.has(capability)
    ? undefined
    : failure("The Python worker capability is not allowlisted.", 422, "UNSUPPORTED_CAPABILITY");
}
function validateTypeScriptCapability(capability: string): DurableExecutionParseFailure | undefined {
  return capability === "ANALYSIS.SHAFT_TORQUE"
    ? undefined
    : failure("The TypeScript backend does not support this capability.", 422, "UNSUPPORTED_CAPABILITY");
}
function validateFEACapability(capability: string): DurableExecutionParseFailure | undefined {
  return capability === "ANALYSIS.STATIC_STRUCTURAL"
    ? undefined
    : failure("The CalculiX worker only supports ANALYSIS.STATIC_STRUCTURAL.", 422, "UNSUPPORTED_CAPABILITY");
}
function validateCFDCapability(capability: string): DurableExecutionParseFailure | undefined {
  return capability === "ANALYSIS.CFD_LAMINAR_CHANNEL"
    ? undefined
    : failure("The OpenFOAM worker only supports ANALYSIS.CFD_LAMINAR_CHANNEL.", 422, "UNSUPPORTED_CAPABILITY");
}
function validateBackendCapability(backend: ExecutionBackend, capability: string): DurableExecutionParseFailure | undefined {
  const validators: Partial<Record<ExecutionBackend, (value: string) => DurableExecutionParseFailure | undefined>> = {
    "typescript-safe": validateTypeScriptCapability,
    "python-worker": validatePythonCapability,
    "fea-worker": validateFEACapability,
    "cfd-worker": validateCFDCapability
  };
  return validators[backend]?.(capability);
}
function hasWorkerConfiguration(url: string | undefined, token: string | undefined): boolean {
  return Boolean(url?.trim() && token?.trim());
}
function workerConfigurationError(backend: ExecutionBackend): DurableExecutionParseFailure | undefined {
  const settings: Partial<Record<ExecutionBackend, { url?: string; token?: string; name: string }>> = {
    "python-worker": { url: process.env.PYTHON_WORKER_URL, token: process.env.PYTHON_WORKER_API_TOKEN, name: "Python" },
    "fea-worker": { url: process.env.CALCULIX_WORKER_URL, token: process.env.CALCULIX_WORKER_API_TOKEN, name: "CalculiX" },
    "cfd-worker": { url: process.env.OPENFOAM_WORKER_URL, token: process.env.OPENFOAM_WORKER_API_TOKEN, name: "OpenFOAM" }
  };
  const setting = settings[backend];
  if (!setting || hasWorkerConfiguration(setting.url, setting.token)) return undefined;
  return failure("The " + setting.name + " worker URL and API token must both be configured.", 503, "WORKER_UNAVAILABLE");
}
function parseInputs(value: unknown): ValueParseResult<Record<string, unknown>> {
  if (value === undefined) return parsed({});
  if (!isRecord(value)) return rejected(failure("inputs must be a JSON object when provided.", 400, "INVALID_INPUTS"));
  let serialized: string;
  try { serialized = JSON.stringify(value); }
  catch { return rejected(failure("inputs must be JSON serializable.", 400, "INVALID_INPUTS")); }
  if (serialized.length > 64_000) {
    return rejected(failure("inputs exceed the 64 KB request limit.", 413, "INPUT_TOO_LARGE"));
  }
  return parsed(value);
}
function hasValidOutputItems(value: unknown[]): boolean {
  return value.every(item => typeof item === "string" && Boolean(item.trim()) && item.length <= 128);
}
function parseRequestedOutputs(value: unknown): string[] | DurableExecutionParseFailure {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return failure("requestedOutputs must be an array when provided.", 400, "INVALID_OUTPUTS");
  if (value.length > 64) return failure("requestedOutputs must contain at most 64 non-empty short strings.", 400, "INVALID_OUTPUTS");
  if (!hasValidOutputItems(value)) return failure("requestedOutputs must contain at most 64 non-empty short strings.", 400, "INVALID_OUTPUTS");
  return value as string[];
}
function validateSolverInputs(backend: ExecutionBackend, inputs: Record<string, unknown>): DurableExecutionParseFailure | undefined {
  let errors: string[] = [];
  if (backend === "fea-worker") errors = validateFEACantileverBoxRequest(inputs);
  if (backend === "cfd-worker") errors = validateOpenFOAMLaminarChannelRequest(inputs);
  if (!errors.length) return undefined;
  const name = backend === "fea-worker" ? "CalculiX" : "OpenFOAM";
  return failure("Invalid " + name + " benchmark request: " + errors.join("; "), 422, "INVALID_SOLVER_REQUEST");
}
function timeoutForBackend(backend: ExecutionBackend, inputs: Record<string, unknown>): number {
  if (backend === "python-worker") return 30_000;
  if (backend === "fea-worker") return 120_000;
  if (backend !== "cfd-worker") return 2_000;
  const solver = isRecord(inputs.solver) ? inputs.solver : {};
  const seconds = typeof solver.timeoutSeconds === "number" ? solver.timeoutSeconds : 600;
  return (seconds + 120) * 1000;
}
function requestedOutputsForBackend(backend: ExecutionBackend, outputs: string[]): string[] {
  const normalized: Partial<Record<ExecutionBackend, string[]>> = {
    "fea-worker": ["DISPLACEMENT", "STRESS", "REACTION_FORCE"],
    "cfd-worker": ["VELOCITY_PROFILE", "MASS_FLOW", "RESIDUALS", "ARTIFACTS"]
  };
  return normalized[backend] ?? outputs;
}
function parseIdentity(input: {
  body: Record<string, unknown>; idempotencyKey: string; requestId: string;
}): ValueParseResult<ParsedIdentity> {
  const projectId = parseProjectId(input.body.projectId);
  if (isFailure(projectId)) return rejected(projectId);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  if (isFailure(idempotencyKey)) return rejected(idempotencyKey);
  const capability = parseCapability(input.body.capability);
  if (isFailure(capability)) return rejected(capability);
  const backend = parseBackend(input.body.backend);
  if (isFailure(backend)) return rejected(backend);
  const capabilityError = validateBackendCapability(backend, capability);
  if (capabilityError) return rejected(capabilityError);
  const configError = workerConfigurationError(backend);
  if (configError) return rejected(configError);
  return parsed({ projectId, idempotencyKey, capability, backend, requestId: input.requestId });
}
function parsePayload(input: {
  body: Record<string, unknown>; backend: ExecutionBackend;
}): ValueParseResult<ParsedPayload> {
  const inputs = parseInputs(input.body.inputs);
  if (!inputs.valid || !inputs.value) return rejected(inputs.failure as DurableExecutionParseFailure);
  const outputs = parseRequestedOutputs(input.body.requestedOutputs);
  if (isFailure(outputs)) return rejected(outputs);
  const solverError = validateSolverInputs(input.backend, inputs.value);
  if (solverError) return rejected(solverError);
  return parsed({
    inputs: inputs.value,
    requestedOutputs: requestedOutputsForBackend(input.backend, outputs),
    timeoutMs: timeoutForBackend(input.backend, inputs.value)
  });
}
export function parseDurableExecutionInput(input: {
  body: Record<string, unknown>; idempotencyKey: string; requestId: string;
}): DurableExecutionParseResult {
  const identity = parseIdentity(input);
  if (!identity.valid) return identity.failure as DurableExecutionParseFailure;
  const payload = parsePayload({ body: input.body, backend: identity.value!.backend });
  if (!payload.valid) return payload.failure as DurableExecutionParseFailure;
  return {
    ok: true,
    value: { ...identity.value!, ...payload.value! }
  };
}
export function buildDurableExecutionRequest(input: DurableExecutionInput, jobId: string): ExecutionRequest {
  return {
    id: jobId, capability: input.capability, backend: input.backend,
    inputs: input.inputs, requestedOutputs: input.requestedOutputs,
    timeoutMs: input.timeoutMs, projectId: input.projectId, correlationId: input.requestId
  };
}
