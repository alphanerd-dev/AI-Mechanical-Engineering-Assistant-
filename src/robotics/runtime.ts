import {RoboticsAsset} from "./types.js";
import {validateRoboticsAsset} from "./validation.js";

export interface RoboticsRuntimeHandle{
  runtime:string;
  handle:string;
  assetId:string;
}

export interface RoboticsRuntimeLoader{
  load(asset:RoboticsAsset):Promise<RoboticsRuntimeHandle>;
}

export interface RoboticsRuntimePreparation{
  valid:boolean;
  errors:string[];
  warnings:string[];
}

export function validateRoboticsRuntimeAsset(asset:RoboticsAsset):RoboticsRuntimePreparation{
  const validation=validateRoboticsAsset(asset);
  const errors=[...validation.errors];
  const warnings=[...validation.warnings];

  if(asset.validationStatus!=="PASS")
    errors.push("Robotics runtime loading requires an asset with validationStatus PASS.");
  if(!asset.sourceCadArtifactId?.trim())
    warnings.push("Robotics runtime asset has no source CAD artifact lineage.");
  if(!asset.uri?.trim()&&!asset.content?.trim())
    errors.push("Robotics runtime loading requires an explicit asset uri or content.");

  return {valid:errors.length===0,errors,warnings};
}
