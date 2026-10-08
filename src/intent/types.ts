import {EngineeringContext} from "../experience/context.js";
import {EngineeringCompletionReport,ShaftEngineeringCompletionRequest} from "../completion/types.js";
import {RiskAdaptiveExperienceDecision} from "../experience/types.js";

export interface EngineeringIntentInterpretation{
  raw:string;
  goal:string;
  completionUnit?:string;
  extractedInputs:Partial<ShaftEngineeringCompletionRequest>;
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
  context?:EngineeringContext;
  approval?:ShaftEngineeringCompletionRequest["approval"];
}

export interface EngineeringIntentEntryResult{
  interpretation:EngineeringIntentInterpretation;
  experience:RiskAdaptiveExperienceDecision;
  completion?:EngineeringCompletionReport;
  nextQuestion?:string;
  status:"READY"|"NEEDS_INPUT"|"WAITING_APPROVAL"|"COMPLETE"|"FAILED";
  decisionSummary:string;
}
