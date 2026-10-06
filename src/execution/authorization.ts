import {CapabilityRisk} from "../core/types.js";

export type ApprovalStatus="NOT_REQUIRED"|"PENDING"|"APPROVED"|"DENIED";

export interface ExecutionAuthorization {
  capability:string;
  risk:CapabilityRisk;
  status:ApprovalStatus;
  actorId?:string;
  reason?:string;
  approvedAt?:string;
}

export interface AuthorizationPolicy {
  requiresApproval(risk:CapabilityRisk):boolean;
  authorize(request:{capability:string;risk:CapabilityRisk},approval?:ExecutionAuthorization):ExecutionAuthorization;
}

export const DEFAULT_AUTHORIZATION_POLICY:AuthorizationPolicy={
  requiresApproval:risk=>risk==="HIGH"||risk==="CRITICAL",
  authorize:(request,approval)=>{
    if(!DEFAULT_AUTHORIZATION_POLICY.requiresApproval(request.risk))
      return {capability:request.capability,risk:request.risk,status:"NOT_REQUIRED"};
    if(!approval) return {capability:request.capability,risk:request.risk,status:"PENDING",reason:"Human approval required before execution."};
    if(approval.status!=="APPROVED")
      return {capability:request.capability,risk:request.risk,status:"DENIED",actorId:approval.actorId,reason:approval.reason??"Approval was not granted."};
    return {...approval,capability:request.capability,risk:request.risk,status:"APPROVED",approvedAt:approval.approvedAt??new Date().toISOString()};
  }
};
