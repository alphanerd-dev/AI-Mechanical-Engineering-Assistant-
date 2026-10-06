import {CoSimulationRequest,CoSimulationResult} from "./types.js";

export function validateCoSimulationStepAlignment(request:CoSimulationRequest):string[]{
  const errors:string[]=[];
  for(const participant of request.participants){
    const ratio=participant.stepS/request.communicationStepS;
    if(Math.abs(ratio-Math.round(ratio))>1e-9)
      errors.push("Participant "+participant.id+" stepS must be an integer multiple of communicationStepS.");
  }
  return errors;
}

export function unavailableCoSimulation():CoSimulationResult{
  return {
    status:"UNAVAILABLE",
    participants:[],
    steps:0,
    warnings:["No co-simulation runtime is configured."],
    message:"Co-simulation provider boundary exists, but no runtime is configured."
  };
}
