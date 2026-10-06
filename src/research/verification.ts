import {ResearchFinding} from "./types.js";
import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";

export type VerificationMethod =
  | "SOURCE_INSPECTION"
  | "INDEPENDENT_CALCULATION"
  | "MANUFACTURER_CONFIRMATION"
  | "HUMAN_REVIEW";

export interface VerificationRequest {
  finding: ResearchFinding;
  method: VerificationMethod;
  verifier: string;
  notes?: string;
  evidenceUri?: string;
  supportingEvidence?: string[];
}

export interface VerificationResult {
  findingId:string;
  verified:boolean;
  informationStatus:"ASSUMED"|"VERIFIED";
  evidence:EvidenceRecord;
  reason:string;
}

const ALLOWED:VerificationMethod[]=[
  "SOURCE_INSPECTION",
  "INDEPENDENT_CALCULATION",
  "MANUFACTURER_CONFIRMATION",
  "HUMAN_REVIEW"
];

export function verifyResearchFinding(request:VerificationRequest):VerificationResult{
  if(!request.finding.claim.trim()) throw new Error("Finding claim is required.");
  if(!ALLOWED.includes(request.method)) throw new Error("Unsupported verification method.");
  if(!request.verifier.trim()) throw new Error("Verifier is required.");

  const supporting=request.supportingEvidence?.filter(Boolean)??[];
  const hasEvidence=Boolean(request.evidenceUri)||supporting.length>0;

  const verified=hasEvidence;
  const status=verified?"VERIFIED":"ASSUMED";
  const evidence:EvidenceRecord={
    id:`research-verification:${request.finding.id}:${Date.now()}`,
    type:request.method==="HUMAN_REVIEW"?"HUMAN_REVIEW":"SOURCE",
    claim:request.finding.claim,
    source:request.evidenceUri??request.finding.sourceIds.join(","),
    method:request.method,
    value:{
      verifier:request.verifier,
      notes:request.notes,
      supportingEvidence:supporting
    },
    status,
    timestamp:new Date().toISOString()
  };

  return {
    findingId:request.finding.id,
    verified,
    informationStatus:status,
    evidence,
    reason:verified
      ? `Verified by ${request.method} with explicit supporting evidence.`
      : `Verification remains ASSUMED: ${request.method} requires explicit supporting evidence.`
  };
}
