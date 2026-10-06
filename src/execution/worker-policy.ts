import {ExecutionBackend} from "./types.js";

export interface WorkerPolicy {
  backend:ExecutionBackend;
  maxTimeoutMs:number;
  networkAccess:"none"|"controlled";
  filesystem:"read-only-plus-artifacts";
  allowlistedCapabilities:readonly string[];
}

export const PYTHON_NUMERICAL_WORKER_POLICY:WorkerPolicy={
  backend:"python-worker",
  maxTimeoutMs:30_000,
  networkAccess:"none",
  filesystem:"read-only-plus-artifacts",
  allowlistedCapabilities:[
    "UNITS.CONVERT",
    "UNITS.CHECK_DIMENSIONS",
    "MATH.SYMBOLIC_SOLVE",
    "MATH.NUMERICAL_SOLVE",
    "MATH.OPTIMIZE"
  ]
};

export function validateWorkerRequest(policy:WorkerPolicy,capability:string,timeoutMs:number):string[]{
  const e:string[]=[];
  if(!policy.allowlistedCapabilities.includes(capability)) e.push("Capability is not allowlisted for this worker.");
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>policy.maxTimeoutMs) e.push("Requested timeout exceeds worker policy.");
  return e;
}
