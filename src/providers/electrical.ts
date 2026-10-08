import {CapabilityProvider} from "../capabilities/registry";
import {CapabilityRequest,CapabilityResult} from "../core/types";
import {calculateDcPower,calculateDcResistance} from "../engineering/electrical";

export class ElectricalAnalysisProvider implements CapabilityProvider{
  id="electrical-analysis";
  capabilities=["ANALYSIS.DC_POWER","ANALYSIS.DC_RESISTANCE"];

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      const {voltageV,currentA}=request.input as {voltageV:number;currentA:number};
      if(request.capability==="ANALYSIS.DC_POWER"){
        return {capability:request.capability,provider:this.id,success:true,output:calculateDcPower(voltageV,currentA)};
      }
      if(request.capability==="ANALYSIS.DC_RESISTANCE"){
        return {capability:request.capability,provider:this.id,success:true,output:calculateDcResistance(voltageV,currentA)};
      }
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported electrical analysis capability."};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:String(error)};
    }
  }
}
