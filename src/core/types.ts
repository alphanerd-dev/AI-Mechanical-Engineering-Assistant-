export type InformationStatus="KNOWN"|"ASSUMED"|"ESTIMATED"|"CALCULATED"|"MEASURED"|"VERIFIED";
export type RequirementPriority="MUST"|"SHOULD"|"COULD";
export type CapabilityRisk="LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
export type CapabilityStatus="EXPERIMENTAL"|"PILOT"|"VERIFIED"|"BLOCKED"|"DEPRECATED";
export type EngineeringDomain=
  "cad"|"analysis"|"simulation"|"research"|"plm"|"manufacturing"|"validation"|
  "computation"|"requirements"|"dynamics"|"robotics"|"ecad"|"vision"|"thermal"|"fluids"|"materials"|"orchestration";

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
  evidenceIds?:string[];
}

export type EngineeringIntentInputSource="USER"|"CONTEXT"|"UNKNOWN";

export interface EngineeringIntentInput{
  name:string;
  value?:number|string;
  unit?:string;
  source:EngineeringIntentInputSource;
  sourceKey?:string;
  sourceText?:string;
}

export interface EngineeringIntent {
  raw:string; goal:string; knownInputs:Record<string,number|string>;
  missingInputs:string[]; requestedCapabilities:string[];
  domain?:string;
  completionUnit?:string;
  inputs?:EngineeringIntentInput[];
  confidence?:"LOW"|"MEDIUM"|"HIGH";
  ambiguity?:"LOW"|"MEDIUM"|"HIGH";
  assumptions?:string[];
}

export interface CapabilityRequest {
  capability:string; input:Record<string,unknown>; risk:CapabilityRisk;
}

export interface CapabilityResult {
  capability:string; provider:string; success:boolean; output?:unknown; error?:string;
  evidenceIds?:string[]; artifactIds?:string[];
}

export interface CapabilityDefinition {
  id:string;
  domain:EngineeringDomain;
  purpose:string;
  inputs:string[];
  outputs:string[];
  preconditions?:string[];
  postconditions?:string[];
  risk:CapabilityRisk;
  providers:string[];
  status:CapabilityStatus;
  validator?:string;
  fallback?:string[];
}