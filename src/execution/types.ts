export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type ExecutionBackend = "typescript-safe" | "python-worker" | "cad-worker" | "fea-worker";

export interface UnitValue {
  value: number;
  unit: string;
}

export interface ExecutionRequest {
  id: string;
  capability: string;
  backend: ExecutionBackend;
  inputs: Record<string, unknown>;
  requestedOutputs: string[];
  timeoutMs: number;
}

export interface ExecutionJob {
  id: string;
  request: ExecutionRequest;
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
  artifactIds: string[];
}

export interface ExecutionResult {
  success: boolean;
  outputs: Record<string, unknown>;
  warnings: string[];
  artifactIds: string[];
}
