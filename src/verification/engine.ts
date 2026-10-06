import {EngineeringVerificationReport,VerificationContext} from "./types.js";

export function verifyEngineeringProject(context:VerificationContext):EngineeringVerificationReport{
  const evidenceById=new Map(context.evidence.map(e=>[e.id,e]));
  const requirements=context.project.requirements.map(requirement=>{
    const evidenceIds=context.evidence.filter(e=>e.status==="VERIFIED" && (e.artifactIds?.length ? e.artifactIds.length>0 : true)).map(e=>e.id);
    const linked=evidenceIds.filter(id=>evidenceById.has(id));
    if(requirement.status==="SATISFIED" && linked.length>0)
      return {requirementId:requirement.id,status:"PASS" as const,evidenceIds:linked,reason:"Requirement is satisfied and verified evidence exists."};
    if(requirement.status==="BLOCKED")
      return {requirementId:requirement.id,status:"FAIL" as const,evidenceIds:[],reason:"Requirement is explicitly blocked."};
    return {requirementId:requirement.id,status:"INCOMPLETE" as const,evidenceIds:[],reason:"No verified evidence establishes requirement satisfaction."};
  });
  const blockingReasons=requirements.filter(r=>r.status==="FAIL").map(r=>r.requirementId+": "+r.reason);
  const warnings=requirements.filter(r=>r.status==="INCOMPLETE").map(r=>r.requirementId+": "+r.reason);
  const status=blockingReasons.length?"FAIL":warnings.length?"INCOMPLETE":"PASS";
  return {projectId:context.project.id,status,requirements,verifiedEvidence:context.evidence.filter(e=>e.status==="VERIFIED"),artifacts:context.artifacts,blockingReasons,warnings};
}
