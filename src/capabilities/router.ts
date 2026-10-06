import {CapabilityRequest,CapabilityResult} from "../core/types";
import {CapabilityRegistry} from "./registry";

export class CapabilityRouter {
  constructor(private registry:CapabilityRegistry){}
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    const definition=this.registry.getDefinition(request.capability);
    if(definition?.status==="BLOCKED")
      return {capability:request.capability,provider:"registry",success:false,error:"Capability is blocked"};
    const providers=this.registry.resolve(request.capability);
    if(!providers.length) return {capability:request.capability,provider:"none",success:false,error:"No provider registered"};
    let last:CapabilityResult|undefined;
    for(const provider of providers){
      const result=await provider.execute(request);
      if(result.success) return result;
      last=result;
    }
    return last ?? {capability:request.capability,provider:"none",success:false,error:"All providers failed"};
  }
}
