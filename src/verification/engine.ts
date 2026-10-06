import {EvidenceRecord,EngineeringArtifact} from "../artifacts/engineering-artifacts.js";
import {ProjectState} from "../core/types.js";
import {EngineeringVerificationRequest,EngineeringVerificationResult,ProjectVerificationStatus,VerificationEvidenceType} from "./types.js";

function evidenceMatchesType(evidence:EvidenceRecord,type:VerificationEvidenceType):boolean{
  if(type==="CAD") return evidence.type==="GEOMETRY_CHECK";
  if(type==="FEA") return evidence.type==="SIMULATION";
  if(type==="CALCULATION") return evidence.type==="CALCULATION";
  if(type==="RESEARCH") return evidence.type==="SOURCE";
  if(type==="MEASUREMENT") return evidence.type==="MEASUREMENT";
  if(type==="MANUFACTURING") return evidence.type==="HUMAN_REVIEW";
  return true;
}

export class EngineeringVerificationEngine{
  async verify(request:EngineeringVerificationRequest):Promise<EngineeringVerificationResult>{
    if(!request.requirementId.trim()) return {requirementId:request.requirementId,status:"FAIL",evidenceIds:[],verifiedEvidenceIds:[],satisfiedGates:[],unmetGates:[],reason:"Requirement ID is required."};
    const relevant=request.evidence.filter(e=>e.requirementIds?.includes(request.requirementId));
    const verified=relevant.filter(e=>e.status==="VERIFIED");
    const minimum=request.minimumEvidence??1;
    const gates=request.gates??[];
    const satisfiedGates=gates.filter(g=>verified.filter(e=>evidenceMatchesType(e,g.type)).length>=g.minimum);
    const unmetGates=gates.filter(g=>!satisfiedGates.includes(g));
    if(verified.length>=minimum&&unmetGates.length===0) return {requirementId:request.requirementId,status:"PASS",evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),satisfiedGates,unmetGates,reason:"Requirement has sufficient explicitly attributed VERIFIED evidence and all verification gates are satisfied."};
    return {requirementId:request.requirementId,status:"INCOMPLETE",evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),satisfiedGates,unmetGates,reason:relevant.length===0?"No evidence is explicitly attributed to this requirement.":unmetGates.length>0?"Evidence exists, but one or more required verification gates are incomplete.":"Evidence exists, but the requirement does not yet have sufficient VERIFIED evidence."};
  }
}

export interface EngineeringProjectVerificationRequest{
  project:ProjectState;
  evidence:EvidenceRecord[];
  artifacts:EngineeringArtifact[];
  requirementEvidence?:Record<string,string[]>;
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
):EngineeringProjectVerificationReport{
  const requirements=request.project.requirements.map(requirement=>{
    const relevant=request.evidence.filter(e=>e.requirementIds?.includes(requirement.id));
    const verified=relevant.filter(e=>e.status==="VERIFIED");
    const artifactIds=request.artifacts.filter(a=>a.requirementIds?.includes(requirement.id)).map(a=>a.id);
    if(requirement.status==="BLOCKED"){
      return {requirementId:requirement.id,status:"FAIL" as const,evidenceIds:verified.map(e=>e.id),artifactIds,reason:"Requirement is explicitly blocked."};
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
