import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {shaftTorque} from "../engineering/calculations.js";
import {sizeSolidShaft} from "../engineering/shaft-design.js";
import {CapabilityProvider} from "../capabilities/registry.js";

export class NumericalAnalysisProvider implements CapabilityProvider {
  id="numerical-analysis";
  capabilities=["ANALYSIS.SHAFT_TORQUE","ANALYSIS.SHAFT_SIZE"];
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try {
      if(request.capability==="ANALYSIS.SHAFT_TORQUE") {
        const {powerKw,speedRpm}=request.input as {powerKw:number;speedRpm:number};
        return {capability:request.capability,provider:this.id,success:true,output:shaftTorque(powerKw,speedRpm)};
      }
      if(request.capability==="ANALYSIS.SHAFT_SIZE") {
        return {capability:request.capability,provider:this.id,success:true,
          output:sizeSolidShaft(request.input as never)};
      }
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported numerical capability"};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
