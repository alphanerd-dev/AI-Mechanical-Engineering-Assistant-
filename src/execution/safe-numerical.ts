import {ExecutionBackendAdapter} from "./executor.js";
import {ExecutionRequest,ExecutionResult} from "./types.js";
import {shaftTorque} from "../engineering/calculations.js";

export class SafeNumericalAdapter implements ExecutionBackendAdapter{
 readonly id="execution.typescript-safe";
 readonly retrySafe=true;
 canExecute(request:ExecutionRequest):boolean{return request.backend==="typescript-safe"&&request.capability==="ANALYSIS.SHAFT_TORQUE";}
 async execute(request:ExecutionRequest,signal?:AbortSignal):Promise<ExecutionResult>{
  if(signal?.aborted)throw signal.reason;
  // Do not coerce strings, null, or missing fields into numbers; a malformed
  // request must fail instead of yielding NaN/Infinity and a false success.
  const result=shaftTorque(request.inputs.powerKw as number,request.inputs.speedRpm as number);
  return {success:true,outputs:{...result,torque:{value:result.torqueNm,unit:"N·m"},status:"CALCULATED"},warnings:["This is a deterministic TypeScript calculation adapter, not arbitrary Python execution."],artifactIds:[]};
 }
}
