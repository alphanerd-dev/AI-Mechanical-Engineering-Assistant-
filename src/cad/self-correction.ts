import {CADExecutionRequest,CADExecutionResult,CADWorkerExecutor} from "./execution.js";
import {GeometryValidation} from "./artifacts.js";
import {evaluateCADAcceptance,CADAcceptance} from "./acceptance.js";

export interface CADCorrectionAttempt {
  attempt:number;
  execution:CADExecutionResult;
  validation?:GeometryValidation;
  acceptance?:CADAcceptance;
  diagnosis?:string;
}

export interface CADCorrectionResult {
  success:boolean;
  attempts:CADCorrectionAttempt[];
  finalSource:string;
  reason?:string;
}

export interface CADCorrectionStrategy {
  reviseSource(input:{
    source:string;
    attempt:number;
    execution:CADExecutionResult;
    validation?:GeometryValidation;
    acceptance?:CADAcceptance;
  }):Promise<string>;
}

export interface CADGeometryValidator {
  validate(execution:CADExecutionResult):Promise<GeometryValidation>;
}

export async function executeWithCADCorrection(
  executor:CADWorkerExecutor,
  validator:CADGeometryValidator,
  request:CADExecutionRequest,
  strategy:CADCorrectionStrategy,
  maxAttempts=3
):Promise<CADCorrectionResult>{
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)
    throw new Error("maxAttempts must be an integer between 1 and 5.");

  let source=request.source;
  const attempts:CADCorrectionAttempt[]=[];

  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const execution=await executor.execute({...request,source});
    if(!execution.success){
      const diagnosis=execution.error ?? "CAD execution failed.";
      attempts.push({attempt,execution,diagnosis});
      if(attempt===maxAttempts) return {success:false,attempts,finalSource:source,reason:diagnosis};
      source=await strategy.reviseSource({source,attempt,execution});
      continue;
    }

    const validation=await validator.validate(execution);
    const acceptance=evaluateCADAcceptance(validation);
    attempts.push({attempt,execution,validation,acceptance});

    if(acceptance.accepted)
      return {success:true,attempts,finalSource:source};

    if(attempt===maxAttempts)
      return {success:false,attempts,finalSource:source,reason:acceptance.blockingReasons.join(" ")||"CAD validation did not pass."};

    source=await strategy.reviseSource({source,attempt,execution,validation,acceptance});
  }

  return {success:false,attempts,finalSource:source,reason:"CAD correction loop exhausted."};
}
