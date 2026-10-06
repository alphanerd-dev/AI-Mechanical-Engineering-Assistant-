import {CapabilityDefinition,CapabilityRequest,CapabilityResult} from "../core/types.js";

export interface CapabilityProvider {
  id:string;
  capabilities:string[];
  execute(request:CapabilityRequest):Promise<CapabilityResult>;
}

export class CapabilityRegistry {
  private providers:CapabilityProvider[]=[];
  private definitions=new Map<string,CapabilityDefinition>();

  register(provider:CapabilityProvider){ this.providers.push(provider); }
  registerCapability(definition:CapabilityDefinition){ this.definitions.set(definition.id,definition); }
  registerCatalog(definitions:CapabilityDefinition[]){ definitions.forEach(d=>this.registerCapability(d)); }

  resolve(capability:string){
    const definition=this.definitions.get(capability);
    const providers=this.providers.filter(p=>p.capabilities.includes(capability));
    if(!definition) return providers;
    return providers.sort((a,b)=>{
      const ai=definition.providers.indexOf(a.id), bi=definition.providers.indexOf(b.id);
      return (ai<0?999:ai)-(bi<0?999:bi);
    });
  }

  getDefinition(capability:string){ return this.definitions.get(capability); }
}
