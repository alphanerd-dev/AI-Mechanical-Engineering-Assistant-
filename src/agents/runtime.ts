import {CapabilityRisk,ProjectState} from "../core/types.js";
import {EngineeringWorkflowStage} from "../orchestration/types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";

export interface AgentTaskUpdatePatch {
  name?: string;
  goal?: string;
  capability?: string;
  risk?: CapabilityRisk;
  input?: Record<string, unknown>;
  /** Requirements/dependencies may be added, but an agent cannot remove existing gates. */
  dependsOn?: string[];
  requiredRequirementIds?: string[];
}

export type AgentActionProposal=
  | {
      kind:"CREATE_TASK";
      name:string;
      goal:string;
      capability:string;
      risk:CapabilityRisk;
      input:Record<string,unknown>;
      dependsOn?:string[];
      requiredRequirementIds?:string[];
      approvalRequired?:boolean;
      evidenceRequired?:boolean;
    }
  | {kind:"UPDATE_TASK";taskId:string;patch:AgentTaskUpdatePatch;expectedGraphRevision?:number}
  | {kind:"REQUEST_READY";taskId:string;expectedGraphRevision?:number}
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
  /** Enables model-proposed task creation; defaults to false. */
  allowTaskCreation?:boolean;
  /** Enables model-proposed task updates; defaults to false. */
  allowTaskUpdates?:boolean;
  /** Fail closed unless every capability action is in a non-empty host allowlist. */
  requireCapabilityAllowlist?:boolean;
  /** Fail closed unless specialist delegation is in a non-empty host allowlist. */
  requireSpecialistAllowlist?:boolean;
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