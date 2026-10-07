import {CapabilityRisk} from "../core/types.js";

export type EngineeringIntentType="EXPLORE"|"ANALYZE"|"DESIGN"|"VERIFY"|"RELEASE";
export type EngineeringConsequence="REVERSIBLE"|"PROJECT_STATE"|"EXTERNAL_EFFECT"|"RELEASE";
export type EngineeringAmbiguity="LOW"|"MEDIUM"|"HIGH";
export type EngineeringExperienceLevel="FAST"|"RIGOROUS"|"EXPLICIT";
export type EngineeringExecutionPolicy="AUTO"|"AUTO_WITH_VALIDATION"|"ASK_MINIMUM"|"BLOCK";

export interface RiskAdaptiveExperienceRequest{
  intent:EngineeringIntentType;
  risk:CapabilityRisk;
  consequence:EngineeringConsequence;
  ambiguity:EngineeringAmbiguity;
  missingInputs?:readonly string[];
  authorizationRequired?:boolean;
  requestedExperience?:"EXPLORE"|"ENGINEERING"|"VERIFY";
}

export interface RiskAdaptiveExperienceDecision{
  level:EngineeringExperienceLevel;
  executionPolicy:EngineeringExecutionPolicy;
  evidenceRequired:boolean;
  approvalRequired:boolean;
  nextQuestion?:string;
  reasons:string[];
}
