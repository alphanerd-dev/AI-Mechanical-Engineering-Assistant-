import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult,EngineeringDomain} from "../core/types.js";

export interface ProviderDescriptor {
  id:string;
  domain:EngineeringDomain;
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

export interface DynamicsProvider extends EngineeringProvider {
  descriptor:ProviderDescriptor & {domain:"dynamics"};
  execute(request:CapabilityRequest):Promise<CapabilityResult>;
}

export interface RoboticsProvider extends EngineeringProvider {
  descriptor:ProviderDescriptor & {domain:"robotics"};
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

export interface ComputationProvider extends EngineeringProvider {
  descriptor:ProviderDescriptor & {domain:"computation"};
  execute(request:CapabilityRequest):Promise<CapabilityResult>;
}