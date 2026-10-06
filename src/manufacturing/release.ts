import {ManufacturingBOM,validateManufacturingBOM} from "./bom.js";
import {ManufacturingProcessPlan} from "./types.js";
import {validateManufacturingProcessPlan} from "./validation.js";

export interface ManufacturingHumanApproval{
  approvedBy:string;
  approvedAt:string;
  comment?:string;
}

export interface ManufacturingReleaseRequest{
  releaseId:string;
  processPlan:ManufacturingProcessPlan;
  bom:ManufacturingBOM;
  requiredArtifactIds:string[];
  approval?:ManufacturingHumanApproval;
}

export interface ManufacturingReleaseResult{
  status:"READY"|"BLOCKED"|"RELEASED";
  releaseId:string;
  checks:{
    processPlan:boolean;
    bom:boolean;
    artifacts:boolean;
    approval:boolean;
  };
  blockingReasons:string[];
  message:string;
}

export function prepareManufacturingRelease(request:ManufacturingReleaseRequest):ManufacturingReleaseResult{
  const blockingReasons:string[]=[];
  const plan=validateManufacturingProcessPlan(request.processPlan);
  const bom=validateManufacturingBOM(request.bom);

  if(!request.releaseId.trim())blockingReasons.push("Release id is required.");
  if(plan.status!=="PASS")blockingReasons.push("Manufacturing process plan is not valid for release.");
  if(bom.status!=="PASS")blockingReasons.push("BOM is not structurally valid for release.");

  const bomArtifactsLinked=request.bom.items.length>0&&request.bom.items.every(item=>Boolean(item.artifactId?.trim()));
  if(!bomArtifactsLinked)blockingReasons.push("Every BOM item must have an explicit linked artifact before release.");

  const required=[...new Set(request.requiredArtifactIds.filter(Boolean))];
  const artifactsReady=request.requiredArtifactIds.length>0&&required.length===request.requiredArtifactIds.length;
  if(!artifactsReady)blockingReasons.push("At least one required artifact id is missing.");

  let approvalReady=true;
  if(request.approval){
    approvalReady=Boolean(request.approval.approvedBy.trim()&&Number.isFinite(Date.parse(request.approval.approvedAt)));
    if(!approvalReady)blockingReasons.push("Human approval is invalid.");
  }

  const checks={
    processPlan:plan.status==="PASS",
    bom:bom.status==="PASS"&&bomArtifactsLinked,
    artifacts:artifactsReady,
    approval:approvalReady
  };

  if(blockingReasons.length)return {
    status:"BLOCKED",
    releaseId:request.releaseId,
    checks,
    blockingReasons,
    message:"Manufacturing release is blocked by one or more explicit readiness failures."
  };

  if(!request.approval)return {
    status:"READY",
    releaseId:request.releaseId,
    checks:{...checks,approval:false},
    blockingReasons:[],
    message:"Release package is structurally ready but remains unreleased until an explicit human approval is supplied."
  };

  return {
    status:"RELEASED",
    releaseId:request.releaseId,
    checks,
    blockingReasons:[],
    message:"Release package passed structural gates and has explicit human approval."
  };
}
