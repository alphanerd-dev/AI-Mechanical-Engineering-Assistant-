import {InformationStatus} from "../core/types.js";

export interface EngineeringQuantity {
  value:number;
  unit:string;
  status:InformationStatus;
  source?:string;
}

export interface ComputationInput {
  name:string;
  quantity?:EngineeringQuantity;
  value?:number|string;
  unit?:string;
  status:InformationStatus;
}

export interface ComputationRequest {
  operation:string;
  inputs:ComputationInput[];
  expression?:string;
  constraints?:string[];
  options?:Record<string,unknown>;
}

export interface ComputationEvidence {
  equation?:string;
  assumptions:string[];
  inputs:ComputationInput[];
  provider:string;
  providerVersion?:string;
  executionId?:string;
  independentChecks?:string[];
}

export interface ComputationResult {
  operation:string;
  success:boolean;
  outputs:EngineeringQuantity[];
  residual?:number;
  warnings:string[];
  evidence:ComputationEvidence;
}
