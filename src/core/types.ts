export type InformationStatus = "KNOWN"|"ASSUMED"|"ESTIMATED"|"CALCULATED"|"MEASURED"|"VERIFIED";
export type RequirementPriority = "MUST"|"SHOULD"|"COULD";

export interface Requirement {
  id:string; name:string; value?:number|string; unit?:string; tolerance?:number|string;
  priority:RequirementPriority; verificationMethod?:string; status:"OPEN"|"SATISFIED"|"BLOCKED";
}

export interface EngineeringEvent {
  id:string; timestamp:string; actor:string; action:string;
  input?:unknown; output?:unknown; evidence?:string[];
}

export interface ProjectState {
  id:string; name:string; stage:string; status:"ACTIVE"|"BLOCKED"|"COMPLETE";
  requirements:Requirement[]; assumptions:string[]; openQuestions:string[];
  unresolvedRisks:string[]; events:EngineeringEvent[]; nextAction?:string;
}

export interface EngineeringIntent {
  raw:string; goal:string; knownInputs:Record<string,number|string>;
  missingInputs:string[]; requestedCapabilities:string[];
}

export interface CapabilityRequest {
  capability:string; input:Record<string,unknown>; risk:"LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
}

export interface CapabilityResult {
  capability:string; provider:string; success:boolean; output?:unknown; error?:string;
}
