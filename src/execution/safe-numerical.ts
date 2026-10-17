import {ExecutionBackendAdapter} from "./executor.js";
import {ExecutionRequest,ExecutionResult} from "./types.js";
import {shaftTorque} from "../engineering/calculations.js";

export class SafeNumericalAdapter implements ExecutionBackendAdapter{
 readonly id="execution.typescript-safe";
 readonly retrySafe=true;
 canExecute(request:ExecutionRequest):boolean{return request.backend==="typescript-safe"&&request.capability==="ANALYSIS.SHAFT_TORQUE";}
 async execute(request:ExecutionRequest,signal?:AbortSignal):Promise<ExecutionResult>{
  if(signal?.aborted)throw signal.reason;
  const result=shaftTorque(Number(request.inputs.powerKw),Number(request.inputs.speedRpm));
  return {success:true,outputs:{...result,torque:{value:result.torqueNm,unit:"N·m"},status:"CALCULATED"},warnings:["This is a deterministic TypeScript calculation adapter, not arbitrary Python execution."],artifactIds:[]};
 }
}
