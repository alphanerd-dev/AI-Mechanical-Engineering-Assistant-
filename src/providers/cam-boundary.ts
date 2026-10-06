import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {unavailableCAMPlan} from "../manufacturing/cam.js";

export class CAMBoundaryProvider implements EngineeringProvider{
  readonly id="cam.boundary";
  readonly capabilities=["MANUFACTURING.CAM_PLAN"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"manufacturing",
    status:"EXPERIMENTAL",
    capabilities:this.capabilities,
    version:"1.0"
  };

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="MANUFACTURING.CAM_PLAN")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported CAM capability"};
    return {
      capability:request.capability,
      provider:this.id,
      success:false,
      output:unavailableCAMPlan()
    };
  }
}
