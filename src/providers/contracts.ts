import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";

export interface ProviderDescriptor {
  id:string;
  domain:"cad"|"analysis"|"simulation"|"research"|"plm"|"manufacturing"|"validation";
  version?:string;
  status:"EXPERIMENTAL"|"PILOT"|"VERIFIED"|"BLOCKED"|"DEPRECATED";
  capabilities:string[];
  requires?:string[];
}

export interface EngineeringProvider extends CapabilityProvider {
  descriptor:ProviderDescriptor;
}

export interface SimulationProvider extends EngineeringProvider {
  descriptor:ProviderDescriptor & {domain:"simulation"};
  execute(request:CapabilityRequest):Promise<CapabilityResult>;
}

export interface PLMProvider extends EngineeringProvider {
  descriptor:ProviderDescriptor & {domain:"plm"};
  execute(request:CapabilityRequest):Promise<CapabilityResult>;
}

export interface CADProvider extends EngineeringProvider {
  descriptor:ProviderDescriptor & {domain:"cad"};
  execute(request:CapabilityRequest):Promise<CapabilityResult>;
}
