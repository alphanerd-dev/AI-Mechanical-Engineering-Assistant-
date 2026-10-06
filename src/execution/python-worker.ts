import {ExecutionBackendAdapter} from "./executor.js";
import {ExecutionRequest,ExecutionResult} from "./types.js";
import {PYTHON_NUMERICAL_WORKER_POLICY,validateWorkerRequest} from "./worker-policy.js";
const ALLOWED=["ANALYSIS.SHAFT_TORQUE","ANALYSIS.SHAFT_SIZE","UNITS.CONVERT","UNITS.CHECK_DIMENSIONS","MATH.SYMBOLIC_SOLVE"];
export class PythonWorkerAdapter implements ExecutionBackendAdapter{
 readonly id="execution.python-worker";
 constructor(private readonly client:{run(request:ExecutionRequest):Promise<ExecutionResult>}){}
 canExecute(r:ExecutionRequest){return r.backend==="python-worker"&&ALLOWED.includes(r.capability);}
 execute(r:ExecutionRequest){const errors=validateWorkerRequest(PYTHON_NUMERICAL_WORKER_POLICY,r.capability,r.timeoutMs);if(errors.length)return Promise.resolve({success:false,outputs:{},warnings:errors,artifactIds:[]});return this.client.run(r);}
}
