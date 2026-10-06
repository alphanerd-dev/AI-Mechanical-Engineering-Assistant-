import {ProjectState} from "../core/types.js";
import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {EngineeringMemory} from "../memory/memory-store.js";

export interface ResearchIngestionResult {
  ingested:boolean;
  evidenceId?:string;
  requirementIds:string[];
  reason:string;
}

export function ingestVerifiedResearch(
  project:ProjectState,
  memory:EngineeringMemory,
  evidence:EvidenceRecord,
  requirementIds:string[]=[]
):ResearchIngestionResult{
  if(evidence.status!=="VERIFIED"){
    return {ingested:false,requirementIds:[],reason:"Only VERIFIED evidence may enter engineering memory."};
  }

  const validRequirementIds=requirementIds.filter(id=>project.requirements.some(r=>r.id===id));
  const linkedEvidence: EvidenceRecord = { ...evidence, requirementIds: [...new Set([...(evidence.requirementIds ?? []), ...validRequirementIds])] };
  memory.saveEvidence(project.id,linkedEvidence);
  project.evidenceIds ??= [];
  project.evidenceIds.push(linkedEvidence.id);
  for(const id of validRequirementIds){
    memory.linkEvidence(project.id,id,evidence.id);
  }

  project.events.push({
    id:crypto.randomUUID(),
    timestamp:new Date().toISOString(),
    actor:"research-verification",
    action:"INGEST_VERIFIED_RESEARCH",
    input:{claim:evidence.claim,requirementIds:validRequirementIds},
    output:{evidenceId:linkedEvidence.id,status:linkedEvidence.status},
    evidence:[linkedEvidence.id]
  });

  return {
    ingested:true,
    evidenceId:linkedEvidence.id,
    requirementIds:validRequirementIds,
    reason:"Verified research evidence entered project memory."
  };
}
