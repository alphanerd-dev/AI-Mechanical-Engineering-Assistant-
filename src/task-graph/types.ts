import {CapabilityRisk,ProjectState} from "../core/types.js";

export type EngineeringTaskStatus="PROPOSED"|"READY"|"RUNNING"|"BLOCKED"|"COMPLETED"|"FAILED"|"VERIFIED";

export interface EngineeringTask{
  id:string;
  projectId:string;
  name:string;
  goal:string;
  capability?:string;
  risk:CapabilityRisk;
  input:Record<string,unknown>;
  dependsOn?:string[];
  requiredRequirementIds?:string[];
  approvalRequired?:boolean;
  approvalGranted?:boolean;
  evidenceRequired?:boolean;
  maxAttempts?:number;
  status:EngineeringTaskStatus;
  blockedReason?:string;
  createdAt:string;
  updatedAt:string;
}

export interface EngineeringTaskGraph{
  id:string;
  projectId:string;
  revision:number;
  tasks:EngineeringTask[];
}

export type EngineeringTaskTransition=
  "READY"|"RUNNING"|"BLOCKED"|"COMPLETED"|"FAILED"|"VERIFIED";

export interface ReadyTaskEvaluation{
  taskId:string;
  ready:boolean;
  reasons:string[];
}

export interface TaskGraphContext{
  project?:ProjectState;
}
