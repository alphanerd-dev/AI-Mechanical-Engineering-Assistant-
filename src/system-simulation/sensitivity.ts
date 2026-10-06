import {SystemSensitivityRequest,SystemSensitivityResult,SystemSimulationResult} from "./types.js";

function metric(result:SystemSimulationResult,name:string):number|undefined{
  const value=result.metrics[name]?.value;
  return value!==undefined&&Number.isFinite(value)?value:undefined;
}

export function resolveSensitivityDelta(request:SystemSensitivityRequest):number|undefined{
  const base=request.baseInput.parameters[request.parameter];
  if(base===undefined)return undefined;
  if(request.absoluteDelta!==undefined)return request.absoluteDelta;
  if(request.relativeDelta!==undefined)return Math.abs(base)*request.relativeDelta;
  return undefined;
}

export function calculateCentralSensitivity(
  request:SystemSensitivityRequest,
  lower:SystemSimulationResult,
  base:SystemSimulationResult,
  upper:SystemSimulationResult
):SystemSensitivityResult{
  const delta=resolveSensitivityDelta(request);
  const baseValue=request.baseInput.parameters[request.parameter];
  const lowerMetric=metric(lower,request.metric);
  const baseMetric=metric(base,request.metric);
  const upperMetric=metric(upper,request.metric);

  if(delta===undefined||delta<=0||baseValue===undefined||lowerMetric===undefined||baseMetric===undefined||upperMetric===undefined)
    return {
      status:"INCOMPLETE",
      parameter:request.parameter,
      metric:request.metric,
      baseValue,
      lowerValue:baseValue!==undefined&&delta!==undefined?baseValue-delta:undefined,
      upperValue:baseValue!==undefined&&delta!==undefined?baseValue+delta:undefined,
      lowerMetric,
      baseMetric,
      upperMetric,
      message:"Sensitivity requires finite base/perturbed parameter and metric values, plus a positive perturbation."
    };

  return {
    status:"COMPLETED",
    parameter:request.parameter,
    metric:request.metric,
    baseValue,
    lowerValue:baseValue-delta,
    upperValue:baseValue+delta,
    lowerMetric,
    baseMetric,
    upperMetric,
    derivative:(upperMetric-lowerMetric)/(2*delta),
    parameterStep:delta,
    message:"Central finite-difference sensitivity calculated from explicit lower/base/upper simulations."
  };
}
