import {EvidenceRecord,EngineeringArtifact} from "../artifacts/engineering-artifacts.js";
import {ProjectState} from "../core/types.js";
import {RequirementTraceability} from "../requirements/traceability.js";
import {ProjectVerificationStatus,VerificationPlan} from "./types.js";
import {executeVerificationPlan} from "./plans.js";

export interface EngineeringProjectVerificationRequest{
  project:ProjectState;
  evidence:EvidenceRecord[];
  artifacts:EngineeringArtifact[];
  requirementEvidence?:Record<string,string[]>;
  verificationPlans?:Record<string,VerificationPlan>;
  traceability?:RequirementTraceability;
}

export interface EngineeringProjectVerificationRequirement{
  requirementId:string;
  status:ProjectVerificationStatus;
  evidenceIds:string[];
  artifactIds:string[];
  reason:string;
}

export interface EngineeringProjectVerificationReport{
  projectId:string;
  status:ProjectVerificationStatus;
  requirements:EngineeringProjectVerificationRequirement[];
}

export function verifyEngineeringProject(
  request:EngineeringProjectVerificationRequest
):Promise<EngineeringProjectVerificationReport>{
  const requirements=request.project.requirements.map(requirement=>{
    const relevant=request.evidence.filter(e=>e.requirementIds?.includes(requirement.id));
    const verified=relevant.filter(e=>e.status==="VERIFIED");
    const artifactIds=request.artifacts.filter(a=>a.requirementIds?.includes(requirement.id)).map(a=>a.id);
    if(requirement.status==="BLOCKED"){
      return {requirementId:requirement.id,status:"FAIL" as const,evidenceIds:verified.map(e=>e.id),artifactIds,reason:"Requirement is explicitly blocked."};
    }

    const plan=request.verificationPlans?.[requirement.id];
    if(plan){
      const result=executeVerificationPlan(
        plan,
        request.evidence,
        request.project,
        request.traceability
      );
      return {
        requirementId:requirement.id,
        status:result.status,
        evidenceIds:result.verifiedEvidenceIds,
        artifactIds,
        reason:result.reason
      };
    }

    if(verified.length===0){
      return {requirementId:requirement.id,status:"INCOMPLETE" as const,evidenceIds:[],artifactIds,reason:"No VERIFIED evidence is explicitly attributed to this requirement."};
    }
    return {requirementId:requirement.id,status:"PASS" as const,evidenceIds:verified.map(e=>e.id),artifactIds,reason:"Requirement has explicitly attributed VERIFIED evidence."};
  });

  const status:ProjectVerificationStatus=requirements.some(r=>r.status==="FAIL")
    ?"FAIL":requirements.some(r=>r.status==="INCOMPLETE")?"INCOMPLETE":"PASS";
  return {projectId:request.project.id,status,requirements};
}
