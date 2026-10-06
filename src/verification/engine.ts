import {EngineeringVerificationReport,VerificationContext} from "./types.js";

export function verifyEngineeringProject(context:VerificationContext):EngineeringVerificationReport{
  const evidenceById=new Map(context.evidence.map(e=>[e.id,e]));
  const requirements=context.project.requirements.map(requirement=>{
    const linkedIds=(context.requirementEvidence?.[requirement.id]??[]).filter(id=>evidenceById.get(id)?.status==="VERIFIED");
    if(requirement.status==="SATISFIED" && linkedIds.length>0)
      return {requirementId:requirement.id,status:"PASS" as const,evidenceIds:linkedIds,reason:"Requirement is satisfied by explicitly linked verified evidence."};
    if(requirement.status==="BLOCKED")
      return {requirementId:requirement.id,status:"FAIL" as const,evidenceIds:linkedIds,reason:"Requirement is explicitly blocked."};
    return {requirementId:requirement.id,status:"INCOMPLETE" as const,evidenceIds:linkedIds,reason:"No explicitly linked verified evidence establishes requirement satisfaction."};
  });
  const blockingReasons=requirements.filter(r=>r.status==="FAIL").map(r=>r.requirementId+": "+r.reason);
  const warnings=requirements.filter(r=>r.status==="INCOMPLETE").map(r=>r.requirementId+": "+r.reason);
  const status=blockingReasons.length?"FAIL":warnings.length?"INCOMPLETE":"PASS";
  return {projectId:context.project.id,status,requirements,verifiedEvidence:context.evidence.filter(e=>e.status==="VERIFIED"),artifacts:context.artifacts,blockingReasons,warnings};
}
