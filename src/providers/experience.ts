import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {RiskAdaptiveExperienceRequest} from "../experience/types.js";
import {assessRiskAdaptiveExperience} from "../experience/risk-adaptive.js";

export class RiskAdaptiveExperienceProvider implements CapabilityProvider{
  id="experience.risk-adaptive";
  capabilities=["ENGINEERING.ASSESS_EXPERIENCE"];

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ENGINEERING.ASSESS_EXPERIENCE"){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:"Unsupported experience capability."
      };
    }
    try{
      const decision=assessRiskAdaptiveExperience(
        request.input as unknown as RiskAdaptiveExperienceRequest
      );
      return {
        capability:request.capability,
        provider:this.id,
        success:true,
        output:decision
      };
    }catch(error){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:error instanceof Error?error.message:"Experience assessment failed."
      };
    }
  }
}
