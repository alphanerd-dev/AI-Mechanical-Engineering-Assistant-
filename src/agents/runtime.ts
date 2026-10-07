import {CapabilityRisk,ProjectState} from "../core/types.js";
import {EngineeringWorkflowStage} from "../orchestration/types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";

export type AgentActionProposal=
  | {kind:"EXECUTE_TASK";taskId:string;stage:EngineeringWorkflowStage;expectedGraphRevision?:number}
  | {kind:"DELEGATE_SPECIALIST";taskId:string;specialistId:string;stage:EngineeringWorkflowStage;expectedGraphRevision?:number}
  | {kind:"REQUEST_APPROVAL";taskId:string;reason:string;expectedGraphRevision?:number}
  | {kind:"STOP";reason:string};

export interface AgentRunLimits{
  maxSteps:number;
  maxTaskExecutions:number;
  maxDelegations:number;
  maxRisk:CapabilityRisk;
  allowedCapabilities?:readonly string[];
  allowedSpecialists?:readonly string[];
  stopOnFailure:boolean;
}

export interface AgentPlanRequest{
  runId:string;
  project?:ProjectState;
  taskGraph:EngineeringTaskGraph;
  limits:AgentRunLimits;
}

export interface AgentResumeRequest{
  runId:string;
  project?:ProjectState;
  taskGraph:EngineeringTaskGraph;
  limits:AgentRunLimits;
  observation?:unknown;
}

export interface AgentDelegationProposal{
  runId:string;
  taskGraph:EngineeringTaskGraph;
  taskId:string;
  specialistId:string;
  stage:EngineeringWorkflowStage;
}

export interface AgentApprovalProposal{
  runId:string;
  taskGraph:EngineeringTaskGraph;
  taskId:string;
  reason:string;
}

export interface AgentRuntimeObservation{
  runId:string;
  status:"RUNNING"|"WAITING_APPROVAL"|"COMPLETED"|"FAILED"|"STOPPED";
  projectId?:string;
  taskGraphId?:string;
  taskGraphRevision?:number;
  stepCount:number;
  taskExecutions:number;
  delegations:number;
  stopReason?:string;
}

export interface AgentRuntime{
  plan(request:AgentPlanRequest):Promise<readonly AgentActionProposal[]>;
  delegate(request:AgentDelegationProposal):Promise<AgentActionProposal>;
  requestApproval(request:AgentApprovalProposal):Promise<AgentActionProposal>;
  resume(request:AgentResumeRequest):Promise<readonly AgentActionProposal[]>;
  observe(runId:string):Promise<AgentRuntimeObservation>;
  stop(runId:string,reason:string):Promise<AgentRuntimeObservation>;
}
