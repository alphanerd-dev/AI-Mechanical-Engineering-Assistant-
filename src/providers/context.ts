import {CapabilityProvider} from "../capabilities/registry";
import {CapabilityRequest,CapabilityResult} from "../core/types";
import {ContextAwareExperienceRequest,resolveEngineeringContext} from "../experience/context";

export class EngineeringContextProvider implements CapabilityProvider{
  id="experience.context";
  capabilities=["ENGINEERING.RESOLVE_CONTEXT"];

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ENGINEERING.RESOLVE_CONTEXT"){
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported context capability."};
    }
    const decision=resolveEngineeringContext(request.input as unknown as ContextAwareExperienceRequest);
    return {capability:request.capability,provider:this.id,success:true,output:decision};
  }
}
