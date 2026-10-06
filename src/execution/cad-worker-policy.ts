import {ExecutionBackend} from './types.js';

export interface CADWorkerPolicy {
  backend:ExecutionBackend; maxTimeoutMs:number; networkAccess:'none'|'controlled';
  filesystem:'read-only-plus-artifacts'; allowedBackends:readonly string[]; allowedCapabilities:readonly string[];
}

export const CAD_CODE_WORKER_POLICY:CADWorkerPolicy={
  backend:'cad-worker', maxTimeoutMs:60_000, networkAccess:'none', filesystem:'read-only-plus-artifacts',
  allowedBackends:['build123d','cadquery'], allowedCapabilities:['CAD.EXECUTE_GENERATED_SOURCE','CAD.CREATE_PART']
};

export function validateCADWorkerRequest(policy:CADWorkerPolicy,capability:string,backend:string,timeoutMs:number):string[]{
  const errors:string[]=[];
  if(!policy.allowedCapabilities.includes(capability)) errors.push('Capability is not allowlisted for the CAD worker.');
  if(!policy.allowedBackends.includes(backend)) errors.push('CAD backend is not allowlisted for the CAD worker.');
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>policy.maxTimeoutMs) errors.push('Requested timeout exceeds CAD worker policy.');
  return errors;
}