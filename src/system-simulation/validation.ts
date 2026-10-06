import {SystemParameterSweepRequest,SystemSimulationInput,SystemSimulationModel,SystemSensitivityRequest,CoSimulationRequest} from "./types.js";

function finite(value:number,name:string,errors:string[]){
  if(!Number.isFinite(value))errors.push(name+" must be finite.");
}

export function validateSystemSimulationModel(model:SystemSimulationModel):string[]{
  const errors:string[]=[];
  if(!model||typeof model!=="object")return ["System simulation model is required."];
  if(!model.id.trim())errors.push("System simulation model id is required.");
  if(!model.name.trim())errors.push("System simulation model name is required.");
  if(model.language!=="MODELICA")errors.push("Only MODELICA system simulation models are supported by V1.24.");
  if(!model.modelName.trim())errors.push("System simulation modelName is required.");
  if(!model.source?.trim()&&!model.uri?.trim())errors.push("System simulation model requires explicit source or uri.");
  return errors;
}

export function validateSystemSimulationInput(input:SystemSimulationInput):string[]{
  if(!input||typeof input!=="object")return ["System simulation input is required."];
  const errors=[...validateSystemSimulationModel(input.model)];
  finite(input.startTimeS,"startTimeS",errors);
  finite(input.stopTimeS,"stopTimeS",errors);
  finite(input.stepS,"stepS",errors);
  if(Number.isFinite(input.stopTimeS)&&Number.isFinite(input.startTimeS)&&input.stopTimeS<=input.startTimeS)errors.push("stopTimeS must exceed startTimeS.");
  if(Number.isFinite(input.stepS)&&input.stepS<=0)errors.push("stepS must be positive.");
  for(const [name,value] of Object.entries(input.parameters??{}))finite(value,"Parameter "+name,errors);
  return errors;
}

export function validateParameterSweepRequest(request:SystemParameterSweepRequest):string[]{
  if(!request||typeof request!=="object")return ["Parameter sweep request is required."];
  const errors=validateSystemSimulationInput(request.baseInput);
  const names=new Set<string>();
  for(const variable of request.variables??[]){
    if(!variable.name.trim())errors.push("Sweep variable name is required.");
    if(names.has(variable.name))errors.push("Duplicate sweep variable: "+variable.name+".");
    names.add(variable.name);
    if(!variable.unit.trim())errors.push("Sweep variable "+variable.name+" requires an explicit unit.");
    finite(variable.lower,variable.name+".lower",errors);
    finite(variable.upper,variable.name+".upper",errors);
    finite(variable.step,variable.name+".step",errors);
    if(Number.isFinite(variable.lower)&&Number.isFinite(variable.upper)&&variable.upper<variable.lower)errors.push("Sweep variable "+variable.name+" has an invalid range.");
    if(Number.isFinite(variable.step)&&variable.step<=0)errors.push("Sweep variable "+variable.name+" requires a positive step.");
    if(request.baseInput?.parameters?.[variable.name]!==undefined)errors.push("Sweep variable "+variable.name+" duplicates a fixed base parameter.");
  }
  if(request.variables?.length===0)errors.push("At least one sweep variable is required.");
  if(request.maxSamples!==undefined&&(!Number.isInteger(request.maxSamples)||request.maxSamples<=0))errors.push("maxSamples must be a positive integer.");
  return errors;
}

export function validateSensitivityRequest(request:SystemSensitivityRequest):string[]{
  if(!request||typeof request!=="object")return ["Sensitivity request is required."];
  const errors=validateSystemSimulationInput(request.baseInput);
  if(!request.parameter.trim())errors.push("Sensitivity parameter is required.");
  const base=request.baseInput?.parameters?.[request.parameter];
  if(base===undefined||!Number.isFinite(base))errors.push("Sensitivity base parameter must be present and finite.");
  if(!request.metric.trim())errors.push("Sensitivity metric is required.");
  const hasAbsolute=request.absoluteDelta!==undefined;
  const hasRelative=request.relativeDelta!==undefined;
  if(!hasAbsolute&&!hasRelative)errors.push("Sensitivity requires an explicit absolute or relative perturbation.");
  if(hasAbsolute&&(request.absoluteDelta===undefined||!Number.isFinite(request.absoluteDelta)||request.absoluteDelta<=0))errors.push("absoluteDelta must be positive and finite.");
  if(hasRelative&&(request.relativeDelta===undefined||!Number.isFinite(request.relativeDelta)||request.relativeDelta<=0))errors.push("relativeDelta must be positive and finite.");
  return errors;
}

export function validateCoSimulationRequest(request:CoSimulationRequest):string[]{
  if(!request||typeof request!=="object")return ["Co-simulation request is required."];
  const errors:string[]=[];
  if(!Array.isArray(request.participants)||request.participants.length<2)errors.push("Co-simulation requires at least two participants.");
  const ids=new Set<string>();
  for(const participant of request.participants??[]){
    if(!participant.id.trim())errors.push("Co-simulation participant id is required.");
    if(ids.has(participant.id))errors.push("Duplicate co-simulation participant id: "+participant.id+".");
    ids.add(participant.id);
    errors.push(...validateSystemSimulationModel(participant.model).map(error=>"Participant "+participant.id+": "+error));
    finite(participant.stepS,"Participant "+participant.id+" stepS",errors);
    if(Number.isFinite(participant.stepS)&&participant.stepS<=0)errors.push("Participant "+participant.id+" stepS must be positive.");
  }
  finite(request.startTimeS,"startTimeS",errors);
  finite(request.stopTimeS,"stopTimeS",errors);
  finite(request.communicationStepS,"communicationStepS",errors);
  if(Number.isFinite(request.stopTimeS)&&Number.isFinite(request.startTimeS)&&request.stopTimeS<=request.startTimeS)errors.push("stopTimeS must exceed startTimeS.");
  if(Number.isFinite(request.communicationStepS)&&request.communicationStepS<=0)errors.push("communicationStepS must be positive.");
  return errors;
}
