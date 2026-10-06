import {CapabilityRequest,CapabilityResult,ProjectState} from "../core/types.js";
import {DigitalThreadGraph,DigitalThreadLink} from "../digital-thread/types.js";

export type EngineeringWorkflowStage=
  "REQUIREMENTS"|"RESEARCH"|"COMPUTATION"|"ANALYSIS"|"CAD"|"SIMULATION"|
  "DYNAMICS"|"ROBOTICS"|"MANUFACTURING"|"VALIDATION"|"PLM";

export type EngineeringWorkflowStepStatus="PENDING"|"RUNNING"|"SUCCESS"|"FAILED"|"BLOCKED"|"SKIPPED"|"INCOMPLETE";
export type EngineeringWorkflowStatus="COMPLETE"|"FAILED"|"BLOCKED"|"INCOMPLETE";
export type EngineeringResultTrust="UNVERIFIED"|"EVIDENCE_BACKED";

export interface WorkflowInputReference{
  stepId:string;
  path?:string;
}

export interface EngineeringWorkflowStep{
  id:string;
  name:string;
  stage:EngineeringWorkflowStage;
  capability:string;
  risk:CapabilityRequest["risk"];
  input:Record<string,unknown>;
  dependsOn?:string[];
  requiredRequirementIds?:string[];
  approvalRequired?:boolean;
  approvalGranted?:boolean;
  requireEvidence?:boolean;
  maxAttempts?:number;
  inputRefs?:Record<string,WorkflowInputReference>;
}

export interface EngineeringWorkflowPlan{
  id:string;
  projectId:string;
  name:string;
  steps:EngineeringWorkflowStep[];
}

export interface EngineeringWorkflowStepResult{
  stepId:string;
  stage:EngineeringWorkflowStage;
  status:EngineeringWorkflowStepStatus;
  attempts:number;
  trust:EngineeringResultTrust;
  capabilityResult?:CapabilityResult;
  reason:string;
}

export interface EngineeringWorkflowReport{
  planId:string;
  projectId:string;
  status:EngineeringWorkflowStatus;
  steps:EngineeringWorkflowStepResult[];
  traceabilityLinks:DigitalThreadLink[];
}

export interface EngineeringOrchestratorContext{
  project?:ProjectState;
  digitalThread?:DigitalThreadGraph;
}

export interface EngineeringOrchestrator{
  execute(plan:EngineeringWorkflowPlan,context?:EngineeringOrchestratorContext):Promise<EngineeringWorkflowReport>;
}
