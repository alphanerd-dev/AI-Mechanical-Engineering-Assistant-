import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {ResearchClaimEvidence} from "./types.js";

export function claimEvidenceRecord(evidence:ResearchClaimEvidence):EvidenceRecord{
  return {
    id:evidence.id,
    type:"SOURCE",
    claim:evidence.claim,
    source:evidence.sourceId,
    method:"claim-level-source-inspection",
    value:{
      excerpt:evidence.excerpt,
      location:evidence.location,
      extractionId:evidence.extractionId,
      findingId:evidence.findingId
    },
    status:evidence.status==="VERIFIED" ? "VERIFIED" : "ASSUMED",
    timestamp:new Date().toISOString()
  };
}
