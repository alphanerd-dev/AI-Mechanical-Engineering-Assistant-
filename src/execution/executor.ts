import { ExecutionJob, ExecutionRequest, ExecutionResult } from "./types.js";

export interface ExecutionBackendAdapter {
  readonly id: string;
  canExecute(request: ExecutionRequest): boolean;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}

export class ExecutionEngine {
  constructor(private readonly adapters: ExecutionBackendAdapter[]) {}

  async run(request: ExecutionRequest): Promise<ExecutionJob> {
    const job: ExecutionJob = {
      id: request.id,
      request,
      status: "QUEUED",
      artifactIds: [],
    };
    const adapter = this.adapters.find((candidate) => candidate.canExecute(request));
    if (!adapter) return { ...job, status: "FAILED", error: "No execution backend available." };

    const startedAt = new Date().toISOString();
    try {
      const result = await adapter.execute(request);
      return {
        ...job,
        status: result.success ? "SUCCEEDED" : "FAILED",
        startedAt,
        finishedAt: new Date().toISOString(),
        result: result.outputs,
        artifactIds: result.artifactIds,
        error: result.success ? undefined : result.warnings.join("; "),
      };
    } catch (error) {
      return {
        ...job,
        status: "FAILED",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: String(error),
      };
    }
  }
}
