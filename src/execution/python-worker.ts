import {ExecutionBackendAdapter} from "./executor.js";
import {ExecutionRequest,ExecutionResult} from "./types.js";
import {PYTHON_NUMERICAL_WORKER_POLICY,validateWorkerRequest} from "./worker-policy.js";
export interface PythonWorkerClient{run(request:ExecutionRequest):Promise<ExecutionResult>;}
export class PythonWorkerAdapter implements ExecutionBackendAdapter{
 readonly id="execution.python-worker";
 constructor(private readonly client:PythonWorkerClient){}
 canExecute(r:ExecutionRequest){return r.backend==="python-worker"&&PYTHON_NUMERICAL_WORKER_POLICY.allowlistedCapabilities.includes(r.capability);}
 execute(r:ExecutionRequest){const errors=validateWorkerRequest(PYTHON_NUMERICAL_WORKER_POLICY,r.capability,r.timeoutMs);if(errors.length)return Promise.resolve({success:false,outputs:{},warnings:errors,artifactIds:[]});return this.client.run(r);}
}