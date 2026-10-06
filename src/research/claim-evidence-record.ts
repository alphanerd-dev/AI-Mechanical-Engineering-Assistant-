import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";

type ResearchClaimEvidence = import("./claim-evidence.js").ResearchClaimEvidence;

export function claimEvidenceRecord(evidence:ResearchClaimEvidence):EvidenceRecord{
  return {
    id:evidence.id,
    type:"SOURCE",
    claim:evidence.claim,
    source:evidence.sourceId,
    method:"claim-level-source-inspection",
    value:{excerpt:evidence.excerpt,location:evidence.location,extractionId:evidence.extractionId,findingId:evidence.findingId},
    status:evidence.status==="VERIFIED" ? "VERIFIED" : "ASSUMED",
    timestamp:new Date().toISOString()
  };
}
