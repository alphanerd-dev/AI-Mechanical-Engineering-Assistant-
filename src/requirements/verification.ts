import {EngineeringMemory} from "../memory/memory-store.js";
import {ProjectState} from "../core/types.js";
import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {RequirementTraceability} from "./traceability.js";

export interface RequirementVerificationResult {
  requirementId:string; evidenceId:string; verified:boolean; reason:string;
}

export function verifyRequirementWithEvidence(
  project:ProjectState,
  memory:EngineeringMemory,
  traceability:RequirementTraceability,
  requirementId:string,
  evidence:EvidenceRecord
):RequirementVerificationResult{
  const requirement=traceability.get(requirementId);
  if(!requirement) return {requirementId,evidenceId:evidence.id,verified:false,reason:"Requirement does not exist in the traceability model."};
  if(evidence.status!=="VERIFIED") return {requirementId,evidenceId:evidence.id,verified:false,reason:"Only VERIFIED evidence can verify a requirement."};
  if(!evidence.requirementIds?.includes(requirementId)) return {requirementId,evidenceId:evidence.id,verified:false,reason:"Evidence is not explicitly attributed to this requirement."};
  if(!project.requirements.some(r=>r.id===requirementId)) return {requirementId,evidenceId:evidence.id,verified:false,reason:"Requirement is not attached to the project."};
  memory.saveEvidence(project.id,evidence);
  memory.linkEvidence(project.id,requirementId,evidence.id);
  const projectRequirement=project.requirements.find(r=>r.id===requirementId)!;
  projectRequirement.status="SATISFIED";
  project.events.push({
    id:crypto.randomUUID(),timestamp:new Date().toISOString(),actor:"requirement-verification",
    action:"REQUIREMENT_VERIFIED",input:{requirementId,evidenceId:evidence.id},output:{status:"SATISFIED"},evidence:[evidence.id]
  });
  return {requirementId,evidenceId:evidence.id,verified:true,reason:"Requirement verified by explicit engineering evidence."};
}
