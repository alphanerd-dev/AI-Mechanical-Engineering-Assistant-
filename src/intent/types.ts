import {EngineeringContext} from "../experience/context.js";
import {EngineeringDecisionMetric} from "../core/types.js";
import {EngineeringApprovalRequest,EngineeringCompletionReport} from "../completion/types.js";
import {RiskAdaptiveExperienceDecision} from "../experience/types.js";

export interface EngineeringIntentInterpretation{
  raw:string;
  goal:string;
  completionUnit?:string;
  extractedInputs:Record<string,number|string>;
  missingInputs:string[];
  confidence:"LOW"|"MEDIUM"|"HIGH";
  ambiguity:"LOW"|"MEDIUM"|"HIGH";
  contextUsed:string[];
  assumptions:string[];
}

export interface EngineeringIntentInterpreter{
  interpret(raw:string,context?:EngineeringContext):Promise<EngineeringIntentInterpretation>;
}

export interface EngineeringIntentEntryRequest{
  rawIntent:string;
  projectId:string;
  sessionId?:string;
  context?:EngineeringContext;
  approval?:EngineeringApprovalRequest;
}

export type {EngineeringDecisionMetric} from "../core/types.js";

export interface EngineeringIntentDecision{
  status:"READY"|"NEEDS_INPUT"|"WAITING_APPROVAL"|"COMPLETE"|"FAILED";
  validationPassed:boolean;
  metrics:EngineeringDecisionMetric[];
  evidenceIds:string[];
  nextAction?:string;
  nextQuestion?:string;
}

export interface EngineeringIntentEntryResult{
  interpretation:EngineeringIntentInterpretation;
  experience:RiskAdaptiveExperienceDecision;
  completion?:EngineeringCompletionReport;
  decision:EngineeringIntentDecision;
  nextQuestion?:string;
  status:"READY"|"NEEDS_INPUT"|"WAITING_APPROVAL"|"COMPLETE"|"FAILED";
  decisionSummary:string;
}
