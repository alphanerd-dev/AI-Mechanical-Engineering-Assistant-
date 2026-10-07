import {EngineeringRole} from "../auth/types.js";

export type AuditOutcome="ALLOWED"|"DENIED"|"SUCCESS"|"FAILURE"|"BLOCKED"|"PENDING";
export type AuditAction=
  |"AUTHENTICATION"
  |"AUTHORIZATION"
  |"PROJECT_READ"
  |"PROJECT_WRITE"
  |"TASK_PROPOSE"
  |"TASK_EXECUTE"
  |"TASK_DELEGATE"
  |"APPROVAL_REQUEST"
  |"APPROVAL_GRANT"
  |"EVIDENCE_READ"
  |"EVIDENCE_WRITE"
  |"IDENTITY_ADMIN"
  |"SYSTEM_EVENT";

export interface AuditActor{
  subject:string;
  roles?:readonly EngineeringRole[];
  actorType:"USER"|"AGENT"|"SYSTEM";
}

export interface AuditEventInput{
  timestamp:string;
  actor:AuditActor;
  action:AuditAction;
  outcome:AuditOutcome;
  projectId?:string;
  resourceType?:string;
  resourceId?:string;
  reason?:string;
  metadata?:Record<string,unknown>;
}

export interface AuditEvent extends AuditEventInput{
  sequence:number;
  previousHash:string|null;
  hash:string;
}

export interface AuditTrail{
  append(event:AuditEventInput):AuditEvent;
  list(projectId?:string):AuditEvent[];
  verify():void;
  head():AuditEvent|undefined;
}
