import type { ExecutionRequest, ExecutionResult } from "./types.js";
import { HttpExecutionWorkerService, type WorkerSubmitResponse, type WorkerStatusResponse } from "./worker-service.js";
import type { PythonWorkerClient } from "./python-worker.js";

export interface HttpExecutionWorkerOptions { pollIntervalMs?: number; maxPolls?: number; }
export interface HttpPythonWorkerOptions extends HttpExecutionWorkerOptions {}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Execution cancelled."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", abort); resolve(); }
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new Error("Execution cancelled."));
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function rejectedSubmission(response: WorkerSubmitResponse): ExecutionResult {
  return {
    success: false, outputs: {},
    warnings: [response.error ?? "Worker rejected execution request."],
    artifactIds: []
  };
}
function successfulStatus(status: WorkerStatusResponse): ExecutionResult | undefined {
  if (status.status !== "SUCCEEDED") return undefined;
  return status.result ?? {
    success: false, outputs: {},
    warnings: ["Worker reported success without a result."],
    artifactIds: []
  };
}
function failedStatus(status: WorkerStatusResponse): ExecutionResult | undefined {
  if (status.status !== "FAILED" && status.status !== "CANCELLED") return undefined;
  return {
    success: false, outputs: {},
    warnings: [status.error ?? ("Worker job " + status.status.toLowerCase() + ".")],
    artifactIds: []
  };
}

export class HttpExecutionWorkerClient {
  private readonly service: HttpExecutionWorkerService;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;

  constructor(baseUrl: string, fetchImpl: typeof fetch = fetch, apiToken?: string, options: HttpExecutionWorkerOptions = {}) {
    this.service = new HttpExecutionWorkerService(baseUrl, fetchImpl, apiToken);
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.maxPolls = options.maxPolls ?? 100;
  }

  async run(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult> {
    const accepted = await this.service.submit(request, signal);
    if (!accepted.accepted) return rejectedSubmission(accepted);
    return this.waitForAcceptedJob(accepted, signal);
  }

  private async waitForAcceptedJob(
    accepted: WorkerSubmitResponse,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    const cancelRemote = () => { void this.service.cancel(accepted.jobId).catch(() => undefined); };
    if (signal?.aborted) {
      cancelRemote();
      throw signal.reason ?? new Error("Execution cancelled.");
    }
    signal?.addEventListener("abort", cancelRemote, { once: true });
    try {
      return await this.pollAcceptedJob(accepted.jobId, signal);
    } finally {
      signal?.removeEventListener("abort", cancelRemote);
    }
  }

  private async pollAcceptedJob(jobId: string, signal?: AbortSignal): Promise<ExecutionResult> {
    for (let attempt = 0; attempt <= this.maxPolls; attempt++) {
      if (signal?.aborted) throw signal.reason ?? new Error("Execution cancelled.");
      const status = await this.service.status(jobId, signal);
      const terminal = successfulStatus(status) ?? failedStatus(status);
      if (terminal) return terminal;
      if (attempt < this.maxPolls) await sleep(this.pollIntervalMs, signal);
    }
    const error = new Error("Worker polling limit exceeded before execution completed.");
    error.name = "TimeoutError";
    throw error;
  }
}

export class HttpPythonWorkerClient extends HttpExecutionWorkerClient implements PythonWorkerClient {}
