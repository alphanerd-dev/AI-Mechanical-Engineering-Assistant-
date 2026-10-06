import {ProjectState} from "../core/types.js";
import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts.js";

export type VerificationStatus="PASS"|"FAIL"|"INCOMPLETE";
export interface RequirementVerificationSummary { requirementId:string; status:VerificationStatus; evidenceIds:string[]; reason:string; }
export interface EngineeringVerificationReport {
  projectId:string; status:VerificationStatus;
  requirements:RequirementVerificationSummary[];
  verifiedEvidence:EvidenceRecord[];
  artifacts:EngineeringArtifact[];
  blockingReasons:string[];
  warnings:string[];
}
export interface VerificationContext {
  project:ProjectState;
  evidence:EvidenceRecord[];
  artifacts:EngineeringArtifact[];
  requirementEvidence?:Record<string,string[]>;
}
