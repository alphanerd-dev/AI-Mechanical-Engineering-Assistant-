import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityRegistry} from "./registry.js";

export class CapabilityRouter {
  constructor(private registry:CapabilityRegistry){}
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    const providers=this.registry.resolve(request.capability);
    if(!providers.length) return {capability:request.capability,provider:"none",success:false,error:"No provider registered"};
    const result=await providers[0].execute(request);
    if(!result.success && providers.length>1) return providers[1].execute(request);
    return result;
  }
}
