import { ExecutionBackend } from "./types.js";

export interface WorkerPolicy {
  backend: ExecutionBackend;
  maxTimeoutMs: number;
  networkAccess: "none" | "controlled";
  filesystem: "read-only-plus-artifacts";
  allowlistedCapabilities: readonly string[];
}

export const PYTHON_NUMERICAL_WORKER_POLICY: WorkerPolicy = {
  backend: "python-worker",
  maxTimeoutMs: 30_000,
  networkAccess: "none",
  filesystem: "read-only-plus-artifacts",
  allowlistedCapabilities: ["ANALYSIS.SHAFT_TORQUE", "ANALYSIS.SHAFT_SIZE"]
};

export function validateWorkerRequest(policy: WorkerPolicy, capability: string, timeoutMs: number): string[] {
  const errors: string[] = [];
  if (!policy.allowlistedCapabilities.includes(capability)) errors.push("Capability is not allowlisted for this worker.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > policy.maxTimeoutMs) errors.push("Requested timeout exceeds worker policy.");
  return errors;
}
