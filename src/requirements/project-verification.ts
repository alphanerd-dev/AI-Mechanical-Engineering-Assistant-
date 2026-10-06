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
}

export interface EngineeringVerificationResult {
  requirementId:string;
  status:ProjectVerificationStatus;
  evidenceIds:string[];
  verifiedEvidenceIds:string[];
  reason:string;
}

export class EngineeringVerificationEngine {
  async verify(request:EngineeringVerificationRequest):Promise<EngineeringVerificationResult>{
    if(!request.requirementId.trim()){
      return {requirementId:request.requirementId,status:"FAIL",evidenceIds:[],verifiedEvidenceIds:[],reason:"Requirement ID is required."};
    }
    const relevant=request.evidence.filter(e=>e.requirementIds?.includes(request.requirementId));
    const verified=relevant.filter(e=>e.status==="VERIFIED");
    const minimum=request.minimumEvidence??1;
    if(verified.length>=minimum) return {
      requirementId:request.requirementId,status:"PASS",
      evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),
      reason:"Requirement has sufficient explicitly attributed VERIFIED evidence."
    };
    return {
      requirementId:request.requirementId,
      status:relevant.length===0?"INCOMPLETE":"INCOMPLETE",
      evidenceIds:relevant.map(e=>e.id),verifiedEvidenceIds:verified.map(e=>e.id),
      reason:relevant.length===0
        ?"No evidence is explicitly attributed to this requirement."
        :"Evidence exists, but the requirement does not yet have sufficient VERIFIED evidence."
    };
  }
}
