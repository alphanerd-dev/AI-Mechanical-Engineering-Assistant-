import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {EngineeringVerificationRequest,EngineeringVerificationResult,VerificationEvidenceType} from "./types.js";

function evidenceMatchesType(evidence:EvidenceRecord,type:VerificationEvidenceType):boolean{
  if(type==="CAD") return evidence.type==="GEOMETRY_CHECK";
  if(type==="FEA") return evidence.type==="SIMULATION";
  if(type==="CALCULATION") return evidence.type==="CALCULATION";
  if(type==="RESEARCH") return evidence.type==="SOURCE";
  if(type==="MEASUREMENT") return evidence.type==="MEASUREMENT";
  if(type==="MANUFACTURING") return evidence.type==="MANUFACTURING_CHECK";
  return true;
}

export class EngineeringVerificationEngine{
  verify(request:EngineeringVerificationRequest):EngineeringVerificationResult{
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

export {verifyEngineeringProject} from "./project.js";
export type {EngineeringProjectVerificationRequest,EngineeringProjectVerificationRequirement,EngineeringProjectVerificationReport} from "./project.js";
