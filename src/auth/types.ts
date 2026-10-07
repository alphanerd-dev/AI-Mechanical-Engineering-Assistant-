export type EngineeringRole="ENGINEER"|"REVIEWER"|"ADMIN"|"AGENT";
export type EngineeringPermission="PROJECT.READ"|"PROJECT.WRITE"|"TASK.PROPOSE"|"TASK.EXECUTE"|"APPROVAL.REQUEST"|"APPROVAL.GRANT"|"EVIDENCE.READ"|"EVIDENCE.WRITE"|"ADMIN.IDENTITY";

export interface AuthenticatedIdentity{
  subject:string;
  roles:readonly EngineeringRole[];
  projectIds?:readonly string[];
  sessionId?:string;
  authenticatedAt:string;
}
export interface AuthenticationRequest{credential:string;context?:Record<string,unknown>;}
export interface AuthenticationProvider{authenticate(request:AuthenticationRequest):Promise<AuthenticatedIdentity|null>;}
export interface AuthorizationRequest{identity:AuthenticatedIdentity;permission:EngineeringPermission;projectId?:string;}
export interface AuthorizationDecision{allowed:boolean;reason:string;permission:EngineeringPermission;subject:string;projectId?:string;}
