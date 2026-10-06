import {InformationStatus} from "../core/types.js";

export type ManufacturingProcess="MACHINING"|"ADDITIVE"|"SHEET_METAL"|"WELDING"|"CASTING"|"FORMING"|"ASSEMBLY";
export type ManufacturingPlanStatus="DRAFT"|"READY"|"BLOCKED"|"RELEASED";

export interface ManufacturingOperation{
  id:string;
  sequence:number;
  name:string;
  process:ManufacturingProcess;
  workCenter?:string;
  setup?:string;
  parameters?:Record<string,number|string|boolean>;
  predecessorIds?:string[];
  acceptanceCriteria:string[];
}

export interface ManufacturingProcessPlan{
  id:string;
  projectId:string;
  name:string;
  partArtifactIds:string[];
  requirementIds:string[];
  operations:ManufacturingOperation[];
  status:ManufacturingPlanStatus;
  assumptions:string[];
  notes?:string[];
}

export interface ManufacturingPlanValidation{
  valid:boolean;
  status:"PASS"|"INCOMPLETE"|"FAIL";
  errors:string[];
  warnings:string[];
}

export interface ManufacturingInspectionCriterion{
  id:string;
  name:string;
  characteristic:string;
  unit:string;
  nominal?:number;
  tolerance?:number;
  lowerLimit?:number;
  upperLimit?:number;
  method:string;
}

export interface ManufacturingInspectionResult{
  id:string;
  criterionId:string;
  measuredValue?:number;
  unit?:string;
  instrument?:string;
  operator?:string;
  notes?:string;
}

export interface ManufacturingInspectionAcceptance{
  accepted:boolean;
  status:"ACCEPTED"|"REJECTED"|"INCOMPLETE";
  lowerLimit?:number;
  upperLimit?:number;
  reason:string;
  warnings:string[];
}

export interface ManufacturingArtifactBundle{
  processPlan:ManufacturingProcessPlan;
  processArtifactId:string;
  inspectionArtifactId:string;
  evidenceId?:string;
  informationStatus:InformationStatus;
}
