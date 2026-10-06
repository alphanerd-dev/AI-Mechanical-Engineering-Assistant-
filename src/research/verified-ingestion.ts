import {ProjectState} from "../core/types.js";
import {EngineeringMemory} from "../memory/memory-store.js";
import {ResearchFinding} from "./types.js";
import {ResearchClaimEvidence} from "./claim-evidence.js";
import {verifyResearchFinding,VerificationMethod} from "./verification.js";
import {claimEvidenceRecord} from "./claim-evidence-record.js";
import {ingestVerifiedResearch,ResearchIngestionResult} from "./memory-ingestion.js";

export interface VerifiedResearchIngestionRequest {
  project:ProjectState;
  memory:EngineeringMemory;
  finding:ResearchFinding;
  claimEvidence:ResearchClaimEvidence;
  method:VerificationMethod;
  verifier:string;
  requirementIds?:string[];
  evidenceUri?:string;
  supportingEvidence?:string[];
  notes?:string;
}

export interface VerifiedResearchIngestionResponse extends ResearchIngestionResult {
  verificationId?:string;
}

export function verifyAndIngestResearch(request:VerifiedResearchIngestionRequest):VerifiedResearchIngestionResponse{
  if(request.claimEvidence.findingId!==request.finding.id) throw new Error("Claim evidence does not match finding.");
  if(!request.finding.sourceIds.includes(request.claimEvidence.sourceId)) throw new Error("Claim evidence source is not attached to finding.");

  const verification=verifyResearchFinding({
    finding:request.finding,
    method:request.method,
    verifier:request.verifier,
    notes:request.notes,
    evidenceUri:request.evidenceUri,
    supportingEvidence:request.supportingEvidence
  });

  if(!verification.verified){
    return {ingested:false,requirementIds:[],reason:verification.reason,verificationId:verification.evidence.id};
  }

  const evidence=claimEvidenceRecord({...request.claimEvidence,status:"VERIFIED"});
  evidence.value={
    ...(typeof evidence.value==="object"&&evidence.value!==null?evidence.value:{}),
    verificationId:verification.evidence.id,
    verificationMethod:request.method,
    verifier:request.verifier,
    verificationEvidence:request.evidenceUri??request.supportingEvidence??[]
  };
  return ingestVerifiedResearch(request.project,request.memory,evidence,request.requirementIds??[]);
}
