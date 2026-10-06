export type SystemSimulationLanguage="MODELICA";

export interface SystemSimulationModel{
  id:string;
  name:string;
  language:SystemSimulationLanguage;
  modelName:string;
  source?:string;
  uri?:string;
}

export interface SystemSimulationInput{
  model:SystemSimulationModel;
  parameters:Record<string,number>;
  startTimeS:number;
  stopTimeS:number;
  stepS:number;
  outputVariables?:string[];
}

export interface SystemSimulationMetric{
  value:number;
  unit?:string;
}

export interface SystemSimulationResult{
  status:"COMPLETED"|"FAILED"|"INCOMPLETE";
  modelId:string;
  solver:string;
  converged:boolean;
  startTimeS:number;
  stopTimeS:number;
  steps:number;
  metrics:Record<string,SystemSimulationMetric>;
  warnings:string[];
  artifactIds?:string[];
  error?:string;
}

export interface SystemSweepVariable{
  name:string;
  lower:number;
  upper:number;
  step:number;
  unit:string;
}

export interface SystemParameterSweepRequest{
  baseInput:SystemSimulationInput;
  variables:SystemSweepVariable[];
  objective?:{
    metric:string;
    direction:"MINIMIZE"|"MAXIMIZE";
  };
  maxSamples?:number;
}

export interface SystemParameterSweepCase{
  index:number;
  parameters:Record<string,number>;
}

export interface SystemParameterSweepResult{
  status:"COMPLETED"|"NO_FEASIBLE_RESULT"|"INCOMPLETE";
  cases:SystemParameterSweepCase[];
  results:Array<{
    index:number;
    parameters:Record<string,number>;
    simulation:SystemSimulationResult;
    objectiveValue?:number;
  }>;
  bestIndex?:number;
  bestParameters?:Record<string,number>;
  bestObjectiveValue?:number;
  samplesEvaluated:number;
  message:string;
}

export interface SystemSensitivityRequest{
  baseInput:SystemSimulationInput;
  parameter:string;
  absoluteDelta?:number;
  relativeDelta?:number;
  metric:string;
}

export interface SystemSensitivityResult{
  status:"COMPLETED"|"INCOMPLETE"|"FAILED";
  parameter:string;
  metric:string;
  baseValue?:number;
  lowerValue?:number;
  upperValue?:number;
  lowerMetric?:number;
  baseMetric?:number;
  upperMetric?:number;
  derivative?:number;
  unit?:string;
  parameterStep?:number;
  message:string;
}

export interface CoSimulationParticipant{
  id:string;
  model:SystemSimulationModel;
  stepS:number;
}

export interface CoSimulationRequest{
  participants:CoSimulationParticipant[];
  startTimeS:number;
  stopTimeS:number;
  communicationStepS:number;
}

export interface CoSimulationResult{
  status:"COMPLETED"|"FAILED"|"UNAVAILABLE"|"INCOMPLETE";
  participants:string[];
  steps:number;
  warnings:string[];
  artifactIds?:string[];
  message:string;
}
