import {ResearchFinding,ResearchExtraction} from "./types.js";

export interface ResearchClaimEvidence {
  id:string;
  findingId:string;
  sourceId:string;
  claim:string;
  excerpt:string;
  location?:string;
  extractionId:string;
  status:"CANDIDATE"|"VERIFIED";
}

export function createClaimEvidence(
  finding:ResearchFinding,
  extraction:ResearchExtraction
):ResearchClaimEvidence{
  if(finding.extractionId && finding.extractionId!==extraction.id){
    throw new Error("Extraction does not match finding provenance.");
  }
  if(!finding.sourceIds.includes(extraction.sourceId)){
    throw new Error("Extraction source is not attached to finding.");
  }
  return {
    id:`claim-evidence:${finding.id}`,
    findingId:finding.id,
    sourceId:extraction.sourceId,
    claim:finding.claim,
    excerpt:extraction.excerpt,
    location:extraction.location,
    extractionId:extraction.id,
    status:extraction.status
  };
}
