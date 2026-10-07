import {AuthenticatedIdentity,AuthorizationDecision,AuthorizationRequest,EngineeringPermission,EngineeringRole} from "./types.js";

const ROLE_PERMISSIONS:Readonly<Record<EngineeringRole,readonly EngineeringPermission[]>>={
  ENGINEER:["PROJECT.READ","PROJECT.WRITE","TASK.PROPOSE","TASK.EXECUTE","APPROVAL.REQUEST","EVIDENCE.READ","EVIDENCE.WRITE"],
  REVIEWER:["PROJECT.READ","TASK.PROPOSE","APPROVAL.REQUEST","APPROVAL.GRANT","EVIDENCE.READ"],
  ADMIN:["PROJECT.READ","PROJECT.WRITE","TASK.PROPOSE","TASK.EXECUTE","APPROVAL.REQUEST","APPROVAL.GRANT","EVIDENCE.READ","EVIDENCE.WRITE","ADMIN.IDENTITY"],
  AGENT:["PROJECT.READ","TASK.PROPOSE","EVIDENCE.READ"]
};

function assertIdentity(identity:AuthenticatedIdentity):void{
  if(!identity||typeof identity!=="object") throw new Error("Authenticated identity is required.");
  if(typeof identity.subject!=="string"||!identity.subject.trim()) throw new Error("Authenticated identity subject is required.");
  if(!Array.isArray(identity.roles)||identity.roles.length===0) throw new Error("Authenticated identity must have at least one role.");
  if(typeof identity.authenticatedAt!=="string"||Number.isNaN(Date.parse(identity.authenticatedAt))) throw new Error("Authenticated identity timestamp is invalid.");
}

export function permissionsForRoles(roles:readonly EngineeringRole[]):readonly EngineeringPermission[]{
  const permissions=new Set<EngineeringPermission>();
  for(const role of roles){
    const allowed=ROLE_PERMISSIONS[role];
    if(!allowed) throw new Error("Unknown engineering role: "+String(role)+".");
    for(const permission of allowed) permissions.add(permission);
  }
  return [...permissions];
}

export function authorize(request:AuthorizationRequest):AuthorizationDecision{
  assertIdentity(request.identity);
  if(!request.permission) throw new Error("Authorization permission is required.");
  if(request.projectId!==undefined&&!request.projectId.trim()) throw new Error("Authorization projectId cannot be empty.");
  const permissions=permissionsForRoles(request.identity.roles);
  if(!permissions.includes(request.permission)){
    return {allowed:false,reason:"Permission denied: "+request.permission+".",permission:request.permission,subject:request.identity.subject,projectId:request.projectId};
  }
  if(request.projectId!==undefined&&request.identity.projectIds!==undefined&&!request.identity.projectIds.includes(request.projectId)){
    return {allowed:false,reason:"Project scope denied: "+request.projectId+".",permission:request.permission,subject:request.identity.subject,projectId:request.projectId};
  }
  return {allowed:true,reason:"Authorized.",permission:request.permission,subject:request.identity.subject,projectId:request.projectId};
}

export function requireAuthorization(request:AuthorizationRequest):void{
  const decision=authorize(request);
  if(!decision.allowed) throw new Error(decision.reason);
}

export function isIdentityProjectScoped(identity:AuthenticatedIdentity):boolean{
  return identity.projectIds!==undefined;
}
