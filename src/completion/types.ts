import {EngineeringDecisionMetric,ProjectState} from "../core/types.js";
import {AuthenticatedIdentity} from "../auth/types.js";
import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import {EngineeringProjectVerificationReport} from "../verification/project.js";

export interface EngineeringApprovalRequest{
  identity:AuthenticatedIdentity;
  reason:string;
}

export interface ShaftEngineeringCompletionRequest{
  projectId:string;
  powerKw?:number;
  speedRpm?:number;
  bendingMomentNm?:number;
  allowableShearStressMpa?:number;
  proposedDiameterMm?:number;
  approval?:EngineeringApprovalRequest;
}

export type EngineeringCompletionStatus="BLOCKED"|"FAILED"|"WAITING_APPROVAL"|"COMPLETE";

export interface EngineeringValidationSummary{
  passed:boolean;
  reasons:string[];
}

export interface ShaftEngineeringValidation{
  torqueConsistent:boolean;
  diameterAdequate:boolean;
  expectedTorqueNm:number;
  calculatedTorqueNm:number;
  minimumDiameterMm:number;
  proposedDiameterMm:number;
  passed:boolean;
  reasons:string[];
}

export interface EngineeringCompletionReport<TValidation extends EngineeringValidationSummary=EngineeringValidationSummary>{
  projectId:string;
  status:EngineeringCompletionStatus;
  completionUnit?:string;
  decisionMetrics:EngineeringDecisionMetric[];
  project:ProjectState;
  taskGraph:EngineeringTaskGraph;
  artifacts:EngineeringArtifact[];
  evidence:EvidenceRecord[];
  verification:EngineeringProjectVerificationReport|null;
  validation:TValidation|null;
  approvalRequired:boolean;
  approvalGranted:boolean;
  approval?:EngineeringApprovalRequest;
  missingInputs:string[];
  nextAction:string;
  lineage:{
    requirementIds:string[];
    artifactIds:string[];
    evidenceIds:string[];
  };
}

export type ShaftEngineeringCompletionReport=EngineeringCompletionReport<ShaftEngineeringValidation>;

export interface EngineeringCompletionUnitRequest{
  projectId:string;
  inputs:Record<string,number|string>;
  approval?:EngineeringApprovalRequest;
}

export interface EngineeringCompletionUnit{
  id:string;
  capability:string;
  requiredInputs:{key:string;label:string}[];
  execute(request:EngineeringCompletionUnitRequest,router:import("../capabilities/router.js").CapabilityRouter):Promise<EngineeringCompletionReport>;
}
