import {ProjectState} from "../core/types.js";
import {EngineeringMemory} from "../memory/memory-store.js";
import {RequirementTraceability} from "./traceability.js";
import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";

export type ProjectVerificationStatus="PASS"|"INCOMPLETE"|"FAIL";

export interface RequirementVerificationReport {
  requirementId:string;
  status:ProjectVerificationStatus;
  evidenceIds:string[];
  reason:string;
}

export interface ProjectVerificationReport {
  projectId:string;
  status:ProjectVerificationStatus;
  requirements:RequirementVerificationReport[];
  verifiedCount:number;
  incompleteCount:number;
  failedCount:number;
}

export function verifyProjectRequirements(
  project:ProjectState,
  memory:EngineeringMemory,
  traceability:RequirementTraceability
):ProjectVerificationReport {
  const requirements=project.requirements.map(requirement=>{
    const traced=traceability.get(requirement.id);
    if(!traced) return {
      requirementId:requirement.id,status:"FAIL" as const,evidenceIds:[],
      reason:"Requirement is not present in the traceability model."
    };

    const evidence=memory.evidenceForRequirement(project.id,requirement.id);
    const verified=evidence.filter(item=>item.status==="VERIFIED");
    if(requirement.status==="BLOCKED") return {
      requirementId:requirement.id,status:"FAIL" as const,evidenceIds:verified.map(item=>item.id),
      reason:"Requirement is explicitly blocked."
    };
    if(verified.length===0) return {
      requirementId:requirement.id,status:"INCOMPLETE" as const,evidenceIds:[],
      reason:"No VERIFIED evidence is explicitly linked to this requirement."
    };

    return {
      requirementId:requirement.id,status:"PASS" as const,evidenceIds:verified.map(item=>item.id),
      reason:"Requirement has explicitly linked VERIFIED engineering evidence."
    };
  });

  const verifiedCount=requirements.filter(r=>r.status==="PASS").length;
  const incompleteCount=requirements.filter(r=>r.status==="INCOMPLETE").length;
  const failedCount=requirements.filter(r=>r.status==="FAIL").length;
  const status:ProjectVerificationStatus=failedCount>0?"FAIL":incompleteCount>0?"INCOMPLETE":"PASS";

  return {projectId:project.id,status,requirements,verifiedCount,incompleteCount,failedCount};
}


export interface EngineeringVerificationRequest {
  requirementId:string;
  evidence:EvidenceRecord[];
  minimumEvidence?:number;
  gates?:VerificationEvidenceGate[];
}

export interface EngineeringVerificationResult {
  requirementId:string;
  status:ProjectVerificationStatus;
  evidenceIds:string[];
  verifiedEvidenceIds:string[];
  satisfiedGates:VerificationEvidenceGate[];
  unmetGates:VerificationEvidenceGate[];
  reason:string;
}

function evidenceMatchesType(evidence:EvidenceRecord,type:VerificationEvidenceType):boolean{
  if(type==="CAD") return evidence.type==="GEOMETRY_CHECK";
  if(type==="FEA") return evidence.type==="SIMULATION";
  if(type==="CALCULATION") return evidence.type==="CALCULATION";
  if(type==="RESEARCH") return evidence.type==="SOURCE";
  if(type==="MEASUREMENT") return evidence.type==="MEASUREMENT";
  if(type==="MANUFACTURING") return evidence.type==="HUMAN_REVIEW";
  return true;
}

export class EngineeringVerificationEngine {
  async verify(request:EngineeringVerificationRequest):Promise<EngineeringVerificationResult>{
    if(!request.requirementId.trim()){
      return {requirementId:request.requirementId,status:"FAIL",evidenceIds:[],verifiedEvidenceIds:[],satisfiedGates:[],unmetGates:[],reason:"Requirement ID is required."};
    }
    const relevant=request.evidence.filter(e=>e.requirementIds?.includes(request.requirementId));
    const verified=relevant.filter(e=>e.status==="VERIFIED");
    const minimum=request.minimumEvidence??1;
    const satisfiedGates=(request.gates??[]).filter(g=>verified.filter(e=>evidenceMatchesType(e,g.type)).length>=g.minimum);
    const unmetGates=(request.gates??[]).filter(g=>!satisfiedGates.includes(g));
    if(verified.length>=minimum && unmetGates.length===0){
      return {requirementId:request.requirementId,status:"PASS",evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),satisfiedGates,unmetGates,reason:"Requirement has sufficient explicitly attributed VERIFIED evidence and all verification gates are satisfied."};
    }
    return {requirementId:request.requirementId,status:"INCOMPLETE",evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),satisfiedGates,unmetGates,reason:relevant.length===0?"No evidence is explicitly attributed to this requirement.":unmetGates.length>0?"Evidence exists, but one or more required verification gates are incomplete.":"Evidence exists, but the requirement does not yet have sufficient VERIFIED evidence."};
  }
}


export interface VerificationPlan {
  id:string;
  requirementId:string;
  gates:VerificationEvidenceGate[];
  minimumTotalEvidence?:number;
  approvalRequired?:boolean;
  description?:string;
}

export interface VerificationPlanResult extends EngineeringVerificationResult {
  planId:string;
  approvalRequired:boolean;
}

export async function executeVerificationPlan(
  plan:VerificationPlan,
  evidence:EvidenceRecord[]
):Promise<VerificationPlanResult>{
  const result=await new EngineeringVerificationEngine().verify({
    requirementId:plan.requirementId,
    evidence,
    minimumEvidence:plan.minimumTotalEvidence,
    gates:plan.gates
  });
  return {...result,planId:plan.id,approvalRequired:plan.approvalRequired??false};
}


export type VerificationEvidenceType="CAD"|"FEA"|"CALCULATION"|"RESEARCH"|"MEASUREMENT"|"MANUFACTURING"|"OTHER";

export interface VerificationEvidenceGate {
  type:VerificationEvidenceType;
  minimum:number;
}

export interface EngineeringVerificationRequest {
  requirementId:string;
  evidence:EvidenceRecord[];
  minimumEvidence?:number;
  gates?:VerificationEvidenceGate[];
}

export interface EngineeringVerificationResult {
  requirementId:string;
  status:ProjectVerificationStatus;
  evidenceIds:string[];
  verifiedEvidenceIds:string[];
  satisfiedGates:VerificationEvidenceGate[];
  unmetGates:VerificationEvidenceGate[];
  reason:string;
}

function evidenceMatchesType(evidence:EvidenceRecord,type:VerificationEvidenceType):boolean{
  if(type==="CAD") return evidence.type==="GEOMETRY_CHECK";
  if(type==="FEA") return evidence.type==="SIMULATION";
  if(type==="CALCULATION") return evidence.type==="CALCULATION";
  if(type==="RESEARCH") return evidence.type==="SOURCE";
  if(type==="MEASUREMENT") return evidence.type==="MEASUREMENT";
  if(type==="MANUFACTURING") return evidence.type==="HUMAN_REVIEW";
  return true;
}

export class EngineeringVerificationEngine {
  async verify(request:EngineeringVerificationRequest):Promise<EngineeringVerificationResult>{
    if(!request.requirementId.trim()){
      return {requirementId:request.requirementId,status:"FAIL",evidenceIds:[],verifiedEvidenceIds:[],satisfiedGates:[],unmetGates:[],reason:"Requirement ID is required."};
    }
    const relevant=request.evidence.filter(e=>e.requirementIds?.includes(request.requirementId));
    const verified=relevant.filter(e=>e.status==="VERIFIED");
    const minimum=request.minimumEvidence??1;
    const satisfiedGates=(request.gates??[]).filter(g=>verified.filter(e=>evidenceMatchesType(e,g.type)).length>=g.minimum);
    const unmetGates=(request.gates??[]).filter(g=>!satisfiedGates.includes(g));
    if(verified.length>=minimum && unmetGates.length===0){
      return {requirementId:request.requirementId,status:"PASS",evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),satisfiedGates,unmetGates,reason:"Requirement has sufficient explicitly attributed VERIFIED evidence and all verification gates are satisfied."};
    }
    return {requirementId:request.requirementId,status:"INCOMPLETE",evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),satisfiedGates,unmetGates,reason:relevant.length===0?"No evidence is explicitly attributed to this requirement.":unmetGates.length>0?"Evidence exists, but one or more required verification gates are incomplete.":"Evidence exists, but the requirement does not yet have sufficient VERIFIED evidence."};
  }
}

export interface VerificationPlan {
  id:string;
  requirementId:string;
  gates:VerificationEvidenceGate[];
  minimumTotalEvidence?:number;
  approvalRequired?:boolean;
  description?:string;
}

export interface VerificationPlanResult extends EngineeringVerificationResult {
  planId:string;
  approvalRequired:boolean;
}

export async function executeVerificationPlan(
  plan:VerificationPlan,
  evidence:EvidenceRecord[]
):Promise<VerificationPlanResult>{
  const result=await new EngineeringVerificationEngine().verify({
    requirementId:plan.requirementId,
    evidence,
    minimumEvidence:plan.minimumTotalEvidence,
    gates:plan.gates
  });
  return {...result,planId:plan.id,approvalRequired:plan.approvalRequired??false};
}
