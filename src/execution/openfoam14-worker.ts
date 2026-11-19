import type { ExecutionBackendAdapter } from "./executor.js";
import type { ExecutionRequest, ExecutionResult } from "./types.js";
import type { ExecutionWorkerClient } from "./calculix-benchmark-worker.js";
import type { OpenFOAMLaminarChannelRequest, OpenFOAMLaminarChannelResult } from "../cfd/types.js";
import { validateOpenFOAMLaminarChannelRequest, validateOpenFOAMLaminarChannelResult } from "../cfd/validation.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failure(warnings: string[], outputs: Record<string, unknown> = {}): ExecutionResult {
  return { success: false, outputs, warnings, artifactIds: [], provider: "openfoam14" };
}

/** Only the versioned laminar-channel Poiseuille benchmark is dispatched here. */
export class OpenFOAMLaminarChannelWorkerAdapter implements ExecutionBackendAdapter {
  readonly id = "execution.openfoam14-worker";
  readonly retrySafe = true;

  constructor(private readonly client: ExecutionWorkerClient) {}

  canExecute(request: ExecutionRequest): boolean {
    return request.backend === "cfd-worker" && request.capability === "ANALYSIS.CFD_LAMINAR_CHANNEL";
  }

  async execute(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult> {
    const requestErrors = validateOpenFOAMLaminarChannelRequest(request.inputs);
    if (requestErrors.length) return failure(requestErrors);

    const input = request.inputs as unknown as OpenFOAMLaminarChannelRequest;
    const response = await this.client.run(request, signal);
    const raw = response.outputs.cfdResult;
    if (!isRecord(raw)) {
      return failure(
        [...response.warnings, "OpenFOAM worker returned no normalized CFD result."],
        { workerResponse: response.outputs }
      );
    }

    const result = raw as unknown as OpenFOAMLaminarChannelResult;
    const validation = validateOpenFOAMLaminarChannelResult(input, result);
    const success = response.success && validation.status === "PASS";
    return {
      success,
      outputs: { cfdResult: result, validation },
      warnings: [...response.warnings, ...validation.blockingReasons],
      artifactIds: response.artifactIds,
      evidenceIds: response.evidenceIds ?? [],
      provider: "openfoam14",
      providerVersion: result.solverVersion,
      executionId: request.id,
      completedAt: response.completedAt ?? new Date().toISOString()
    };
  }
}
