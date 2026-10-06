import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
export type ProjectVerificationStatus="PASS"|"INCOMPLETE"|"FAIL";
export type VerificationEvidenceType="CAD"|"FEA"|"CALCULATION"|"RESEARCH"|"MEASUREMENT"|"MANUFACTURING"|"OTHER";
export interface VerificationEvidenceGate{type:VerificationEvidenceType;minimum:number;}
export interface EngineeringVerificationRequest{requirementId:string;evidence:EvidenceRecord[];minimumEvidence?:number;gates?:VerificationEvidenceGate[];}
export interface EngineeringVerificationResult{requirementId:string;status:ProjectVerificationStatus;evidenceIds:string[];verifiedEvidenceIds:string[];satisfiedGates:VerificationEvidenceGate[];unmetGates:VerificationEvidenceGate[];reason:string;}
export interface VerificationPlan{
  id:string;
  requirementId:string;
  gates:VerificationEvidenceGate[];
  minimumTotalEvidence?:number;
  approvalRequired?:boolean;
  description?:string;
  requiredMethods?:string[];
  acceptanceCriteria?:string[];
  dependencies?:string[];
}
export interface VerificationPlanResult extends EngineeringVerificationResult{
  planId:string;
  approvalRequired:boolean;
  requiredMethods:string[];
  acceptanceCriteria:string[];
  dependencies:string[];
}
