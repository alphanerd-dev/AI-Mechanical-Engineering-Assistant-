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
type ProjectId = string & { readonly __brand: "ProjectId" };
type IdempotencyKey = string & { readonly __brand: "IdempotencyKey" };
type CapabilityName = string & { readonly __brand: "CapabilityName" };
type RequestId = string & { readonly __brand: "RequestId" };
type RequestedOutput = string & { readonly __brand: "RequestedOutput" };
type ExecutionTimeoutMs = number & { readonly __brand: "ExecutionTimeoutMs" };

export interface DurableExecutionInput {
  projectId: ProjectId;
  idempotencyKey: IdempotencyKey;
  capability: CapabilityName;
  backend: ExecutionBackend;
  inputs: Record<string, unknown>;
  requestedOutputs: RequestedOutput[];
  requestId: RequestId;
  timeoutMs: ExecutionTimeoutMs;
}
export interface DurableExecutionParseFailure { ok: false; error: string; status: number; code: string; }
interface FailureDetails { message: string; status: number; code: string; }
export interface DurableExecutionParseSuccess { ok: true; value: DurableExecutionInput; }
export type DurableExecutionParseResult = DurableExecutionParseSuccess | DurableExecutionParseFailure;
interface ValueParseResult<T> {
  valid: boolean;
  value?: T;
  failure?: DurableExecutionParseFailure;
}
interface ParsedIdentity {
  projectId: ProjectId;
  idempotencyKey: IdempotencyKey;
  capability: CapabilityName;
  backend: ExecutionBackend;
  requestId: RequestId;
}
interface ParsedPayload {
  inputs: Record<string, unknown>;
  requestedOutputs: RequestedOutput[];
  timeoutMs: ExecutionTimeoutMs;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failure(details: FailureDetails): DurableExecutionParseFailure {
  return { ok: false, error: details.message, status: details.status, code: details.code };
}
function isFailure(value: unknown): value is DurableExecutionParseFailure {
  if (!isRecord(value)) return false;
  return value.ok === false && typeof value.error === "string" &&
    typeof value.status === "number" && typeof value.code === "string";
}
function parsed<T>(value: T): ValueParseResult<T> { return { valid: true, value }; }
function rejected<T>(value: DurableExecutionParseFailure): ValueParseResult<T> { return { valid: false, failure: value }; }

function parseProjectId(value: unknown): ProjectId | DurableExecutionParseFailure {
  if (typeof value !== "string") return failure({ message: "A valid projectId is required for durable execution.", status: 400, code: "PROJECT_ID_REQUIRED" });
  const candidate = value.trim();
  if (!UUID.test(candidate)) return failure({ message: "A valid projectId is required for durable execution.", status: 400, code: "PROJECT_ID_REQUIRED" });
  return candidate as ProjectId;
}
function parseIdempotencyKey(value: string): IdempotencyKey | DurableExecutionParseFailure {
  const key = value.trim();
  if (!IDEMPOTENCY.test(key)) {
    return failure({ message: "Provide an Idempotency-Key header containing 8-128 safe characters.", status: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
  }
  return key as IdempotencyKey;
}
function parseCapability(value: unknown): CapabilityName | DurableExecutionParseFailure {
  if (typeof value !== "string") return failure({ message: "A supported capability name is required.", status: 400, code: "CAPABILITY_REQUIRED" });
  const candidate = value.trim();
  if (!candidate) return failure({ message: "A supported capability name is required.", status: 400, code: "CAPABILITY_REQUIRED" });
  if (candidate.length > 128) return failure({ message: "A supported capability name is required.", status: 400, code: "CAPABILITY_REQUIRED" });
  return candidate as CapabilityName;
}
function parseBackend(value: unknown): ExecutionBackend | DurableExecutionParseFailure {
  const candidate = value === undefined ? "typescript-safe" : value;
  if (typeof candidate !== "string") return failure({ message: "Backend must be typescript-safe, python-worker, fea-worker or cfd-worker.", status: 400, code: "UNSUPPORTED_BACKEND" });
  if (!SUPPORTED_BACKENDS.has(candidate as ExecutionBackend)) {
    return failure({ message: "Backend must be typescript-safe, python-worker, fea-worker or cfd-worker.", status: 400, code: "UNSUPPORTED_BACKEND" });
  }
  return candidate as ExecutionBackend;
}
function validatePythonCapability(capability: string): DurableExecutionParseFailure | undefined {
  return PYTHON_CAPABILITIES.has(capability)
    ? undefined
    : failure({ message: "The Python worker capability is not allowlisted.", status: 422, code: "UNSUPPORTED_CAPABILITY" });
}
function validateTypeScriptCapability(capability: string): DurableExecutionParseFailure | undefined {
  return capability === "ANALYSIS.SHAFT_TORQUE"
    ? undefined
    : failure({ message: "The TypeScript backend does not support this capability.", status: 422, code: "UNSUPPORTED_CAPABILITY" });
}
function validateFEACapability(capability: string): DurableExecutionParseFailure | undefined {
  return capability === "ANALYSIS.STATIC_STRUCTURAL"
    ? undefined
    : failure({ message: "The CalculiX worker only supports ANALYSIS.STATIC_STRUCTURAL.", status: 422, code: "UNSUPPORTED_CAPABILITY" });
}
function validateCFDCapability(capability: string): DurableExecutionParseFailure | undefined {
  return capability === "ANALYSIS.CFD_LAMINAR_CHANNEL"
    ? undefined
    : failure({ message: "The OpenFOAM worker only supports ANALYSIS.CFD_LAMINAR_CHANNEL.", status: 422, code: "UNSUPPORTED_CAPABILITY" });
}
function validateBackendCapability(input: {
  backend: ExecutionBackend;
  capability: string;
}): DurableExecutionParseFailure | undefined {
  const validators: Partial<Record<ExecutionBackend, (value: string) => DurableExecutionParseFailure | undefined>> = {
    "typescript-safe": validateTypeScriptCapability,
    "python-worker": validatePythonCapability,
    "fea-worker": validateFEACapability,
    "cfd-worker": validateCFDCapability
  };
  return validators[input.backend]?.(input.capability);
}
function hasWorkerConfiguration(input: { url?: string; token?: string }): boolean {
  return Boolean(input.url?.trim() && input.token?.trim());
}
function workerConfigurationError(backend: ExecutionBackend): DurableExecutionParseFailure | undefined {
  const settings: Partial<Record<ExecutionBackend, { url?: string; token?: string; name: string }>> = {
    "python-worker": { url: process.env.PYTHON_WORKER_URL, token: process.env.PYTHON_WORKER_API_TOKEN, name: "Python" },
    "fea-worker": { url: process.env.CALCULIX_WORKER_URL, token: process.env.CALCULIX_WORKER_API_TOKEN, name: "CalculiX" },
    "cfd-worker": { url: process.env.OPENFOAM_WORKER_URL, token: process.env.OPENFOAM_WORKER_API_TOKEN, name: "OpenFOAM" }
  };
  const setting = settings[backend];
  if (!setting || hasWorkerConfiguration({ url: setting.url, token: setting.token })) return undefined;
  return failure({ message: "The " + setting.name + " worker URL and API token must both be configured.", status: 503, code: "WORKER_UNAVAILABLE" });
}
function parseInputs(value: unknown): ValueParseResult<Record<string, unknown>> {
  if (value === undefined) return parsed({});
  if (!isRecord(value)) return rejected(failure({ message: "inputs must be a JSON object when provided.", status: 400, code: "INVALID_INPUTS" }));
  let serialized: string;
  try { serialized = JSON.stringify(value); }
  catch { return rejected(failure({ message: "inputs must be JSON serializable.", status: 400, code: "INVALID_INPUTS" })); }
  if (serialized.length > 64_000) {
    return rejected(failure({ message: "inputs exceed the 64 KB request limit.", status: 413, code: "INPUT_TOO_LARGE" }));
  }
  return parsed(value);
}
function hasValidOutputItems(value: unknown[]): boolean {
  return value.every(item => typeof item === "string" && Boolean(item.trim()) && item.length <= 128);
}
function parseRequestedOutputs(value: unknown): RequestedOutput[] | DurableExecutionParseFailure {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return failure({ message: "requestedOutputs must be an array when provided.", status: 400, code: "INVALID_OUTPUTS" });
  if (value.length > 64) return failure({ message: "requestedOutputs must contain at most 64 non-empty short strings.", status: 400, code: "INVALID_OUTPUTS" });
  if (!hasValidOutputItems(value)) return failure({ message: "requestedOutputs must contain at most 64 non-empty short strings.", status: 400, code: "INVALID_OUTPUTS" });
  return value as RequestedOutput[];
}
function validateSolverInputs(input: {
  backend: ExecutionBackend;
  inputs: Record<string, unknown>;
}): DurableExecutionParseFailure | undefined {
  let errors: string[] = [];
  if (input.backend === "fea-worker") errors = validateFEACantileverBoxRequest(input.inputs);
  if (input.backend === "cfd-worker") errors = validateOpenFOAMLaminarChannelRequest(input.inputs);
  if (!errors.length) return undefined;
  const name = input.backend === "fea-worker" ? "CalculiX" : "OpenFOAM";
  return failure({ message: "Invalid " + name + " benchmark request: " + errors.join("; "), status: 422, code: "INVALID_SOLVER_REQUEST" });
}
function asExecutionTimeoutMs(value: number): ExecutionTimeoutMs {
  return value as ExecutionTimeoutMs;
}
function timeoutForBackend(input: {
  backend: ExecutionBackend;
  inputs: Record<string, unknown>;
}): ExecutionTimeoutMs {
  if (input.backend === "python-worker") return asExecutionTimeoutMs(30_000);
  if (input.backend === "fea-worker") return asExecutionTimeoutMs(150_000);
  if (input.backend !== "cfd-worker") return asExecutionTimeoutMs(2_000);
  const solver = isRecord(input.inputs.solver) ? input.inputs.solver : {};
  const seconds = typeof solver.timeoutSeconds === "number" ? solver.timeoutSeconds : 600;
  return asExecutionTimeoutMs((seconds + 130) * 1000);
}
function requestedOutputsForBackend(input: {
  backend: ExecutionBackend;
  outputs: RequestedOutput[];
}): RequestedOutput[] {
  const normalized: Partial<Record<ExecutionBackend, RequestedOutput[]>> = {
    "fea-worker": ["DISPLACEMENT", "STRESS", "REACTION_FORCE"] as RequestedOutput[],
    "cfd-worker": ["VELOCITY_PROFILE", "MASS_FLOW", "RESIDUALS", "ARTIFACTS"] as RequestedOutput[]
  };
  return normalized[input.backend] ?? input.outputs;
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
  const capabilityError = validateBackendCapability({ backend, capability });
  if (capabilityError) return rejected(capabilityError);
  const configError = workerConfigurationError(backend);
  if (configError) return rejected(configError);
  return parsed({ projectId, idempotencyKey, capability, backend, requestId: input.requestId as RequestId });
}
function parsePayload(input: {
  body: Record<string, unknown>; backend: ExecutionBackend;
}): ValueParseResult<ParsedPayload> {
  const inputs = parseInputs(input.body.inputs);
  if (!inputs.valid || !inputs.value) return rejected(inputs.failure as DurableExecutionParseFailure);
  const outputs = parseRequestedOutputs(input.body.requestedOutputs);
  if (isFailure(outputs)) return rejected(outputs);
  const solverError = validateSolverInputs({ backend: input.backend, inputs: inputs.value });
  if (solverError) return rejected(solverError);
  return parsed({
    inputs: inputs.value,
    requestedOutputs: requestedOutputsForBackend({ backend: input.backend, outputs }),
    timeoutMs: timeoutForBackend({ backend: input.backend, inputs: inputs.value })
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
export function buildDurableExecutionRequest(input: {
  execution: DurableExecutionInput;
  jobId: string;
}): ExecutionRequest {
  const { execution, jobId } = input;
  return {
    id: jobId, capability: execution.capability, backend: execution.backend,
    inputs: execution.inputs, requestedOutputs: execution.requestedOutputs,
    timeoutMs: execution.timeoutMs, projectId: execution.projectId, correlationId: execution.requestId
  };
}
