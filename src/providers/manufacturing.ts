import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {evaluateManufacturingInspection,validateManufacturingProcessPlan} from "../manufacturing/validation.js";

export class ManufacturingProvider implements EngineeringProvider{
  readonly id="manufacturing-core";
  readonly capabilities=["MANUFACTURING.VALIDATE_PROCESS_PLAN","MANUFACTURING.EVALUATE_INSPECTION"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"manufacturing",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"1.0"
  };

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      if(request.capability==="MANUFACTURING.VALIDATE_PROCESS_PLAN"){
        const output=validateManufacturingProcessPlan(request.input.plan as Parameters<typeof validateManufacturingProcessPlan>[0]);
        return {capability:request.capability,provider:this.id,success:true,output};
      }
      if(request.capability==="MANUFACTURING.EVALUATE_INSPECTION"){
        const output=evaluateManufacturingInspection(
          request.input.criterion as Parameters<typeof evaluateManufacturingInspection>[0],
          request.input.result as Parameters<typeof evaluateManufacturingInspection>[1]
        );
        return {capability:request.capability,provider:this.id,success:true,output};
      }
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported manufacturing capability"};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Manufacturing capability failed"};
    }
  }
}
