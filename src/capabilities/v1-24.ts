import {CapabilityDefinition} from "../core/types.js";

export const V1_24_CAPABILITIES:CapabilityDefinition[]=[
  {id:"SIMULATION.SYSTEM",domain:"simulation",purpose:"Execute an explicit Modelica system simulation through an OpenModelica provider",inputs:["model","parameters","startTimeS","stopTimeS","stepS","outputVariables"],outputs:["system_simulation_result"],risk:"HIGH",providers:["simulation.openmodelica"],status:"EXPERIMENTAL"},
  {id:"SIMULATION.PARAMETER_SWEEP",domain:"simulation",purpose:"Evaluate an explicitly bounded deterministic parameter grid through OpenModelica",inputs:["baseInput","variables","objective","maxSamples"],outputs:["sweep_result"],risk:"HIGH",providers:["simulation.openmodelica"],status:"EXPERIMENTAL"},
  {id:"SIMULATION.SENSITIVITY",domain:"simulation",purpose:"Estimate local parameter sensitivity using explicit central finite differences around a base system simulation",inputs:["baseInput","parameter","absoluteDelta","relativeDelta","metric"],outputs:["sensitivity_result"],risk:"HIGH",providers:["simulation.openmodelica"],status:"EXPERIMENTAL"},
  {id:"SIMULATION.CO_SIMULATE",domain:"simulation",purpose:"Execute a bounded multi-participant co-simulation through an explicit runtime provider",inputs:["participants","startTimeS","stopTimeS","communicationStepS"],outputs:["co_simulation_result"],risk:"HIGH",providers:["simulation.openmodelica"],status:"EXPERIMENTAL"}
];
