import {CapabilityRequest, CapabilityResult} from "../core/types.js";

export interface CapabilityProvider {
  id:string;
  capabilities:string[];
  execute(request:CapabilityRequest):Promise<CapabilityResult>;
}

export class CapabilityRegistry {
  private providers:CapabilityProvider[]=[];
  register(provider:CapabilityProvider){this.providers.push(provider);}
  resolve(capability:string){return this.providers.filter(p=>p.capabilities.includes(capability));}
}
