import {ProjectState} from "../core/types.js";
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

export type ShaftEngineeringCompletionStatus="BLOCKED"|"FAILED"|"WAITING_APPROVAL"|"COMPLETE";

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

export interface EngineeringCompletionReport{
  projectId:string;
  status:ShaftEngineeringCompletionStatus;
  project:ProjectState;
  taskGraph:EngineeringTaskGraph;
  artifacts:EngineeringArtifact[];
  evidence:EvidenceRecord[];
  verification:EngineeringProjectVerificationReport|null;
  validation:ShaftEngineeringValidation|null;
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
