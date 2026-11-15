import type { ExecutionBackendAdapter } from "./executor.js";
import type { ExecutionRequest, ExecutionResult } from "./types.js";
import type { HttpExecutionWorkerClient } from "./http-python-worker.js";
import type { FEACantileverBoxBenchmarkRequest, FEAStaticStructuralResult } from "../fea/types.js";
import { validateFEACantileverBoxRequest, validateFEACantileverBoxResult } from "../fea/benchmark.js";

export interface ExecutionWorkerClient {
  run(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult>;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failure(warnings: string[], outputs: Record<string, unknown> = {}): ExecutionResult {
  return { success: false, outputs, warnings, artifactIds: [], provider: "open.calculix" };
}

/** Only the pinned cantilever_box benchmark is dispatched to this CalculiX worker. */
export class CalculixBenchmarkWorkerAdapter implements ExecutionBackendAdapter {
  readonly id = "execution.calculix-worker";
  readonly retrySafe = true;
  constructor(private readonly client: ExecutionWorkerClient | HttpExecutionWorkerClient) {}

  canExecute(request: ExecutionRequest): boolean {
    return request.backend === "fea-worker" && request.capability === "ANALYSIS.STATIC_STRUCTURAL";
  }

  async execute(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult> {
    const requestErrors = validateFEACantileverBoxRequest(request.inputs);
    if (requestErrors.length) return failure(requestErrors);
    const inputs = request.inputs as unknown as FEACantileverBoxBenchmarkRequest;
    const response = await this.client.run(request, signal);
    const raw = response.outputs.feaResult;
    if (!isRecord(raw)) return failure(
      [...response.warnings, "CalculiX worker returned no normalized FEA result."],
      { workerResponse: response.outputs }
    );
    const result = raw as unknown as FEAStaticStructuralResult;
    const validation = validateFEACantileverBoxResult(inputs, result);
    const success = response.success && validation.status === "PASS";
    return {
      success,
      outputs: { feaResult: result, validation },
      warnings: [...response.warnings, ...validation.blockingReasons],
      artifactIds: response.artifactIds,
      evidenceIds: response.evidenceIds ?? [],
      provider: "open.calculix",
      providerVersion: result.solverVersion,
      executionId: request.id,
      completedAt: response.completedAt ?? new Date().toISOString()
    };
  }
}
