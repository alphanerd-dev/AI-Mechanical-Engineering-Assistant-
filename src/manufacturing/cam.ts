export type CAMProcess="MILLING"|"TURNING"|"ADDITIVE_SLICING"|"LASER_CUTTING"|"WATERJET";

export interface CAMPlanRequest{
  partArtifactId:string;
  process:CAMProcess;
  operationIds:string[];
  parameters:Record<string,string|number|boolean>;
}

export interface CAMPlanResult{
  status:"UNAVAILABLE"|"INCOMPLETE";
  provider:"cam.boundary";
  message:string;
}

export function unavailableCAMPlan():CAMPlanResult{
  return {
    status:"UNAVAILABLE",
    provider:"cam.boundary",
    message:"CAM/slicing runtime is not configured; the provider boundary exists but no toolpath or slice artifact is claimed."
  };
}
