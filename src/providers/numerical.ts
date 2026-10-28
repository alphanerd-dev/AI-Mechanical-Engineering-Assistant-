import {CapabilityRequest,CapabilityResult} from "../core/types";
import {shaftTorque} from "../engineering/calculations";
import {sizeSolidShaft} from "../engineering/shaft-design";
import {calculatePumpHydraulicPower,PUMP_HYDRAULIC_POWER_CAPABILITY} from "../engineering/pump-hydraulic-power";
import {CapabilityProvider} from "../capabilities/registry";

export class NumericalAnalysisProvider implements CapabilityProvider {
  id="numerical-analysis";
  capabilities=["ANALYSIS.SHAFT_TORQUE","ANALYSIS.SHAFT_SIZE",PUMP_HYDRAULIC_POWER_CAPABILITY];
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try {
      if(request.capability==="ANALYSIS.SHAFT_TORQUE") {
        const {powerKw,speedRpm}=request.input as {powerKw:number;speedRpm:number};
        return {capability:request.capability,provider:this.id,success:true,output:shaftTorque(powerKw,speedRpm)};
      }
      if(request.capability===PUMP_HYDRAULIC_POWER_CAPABILITY) {
        return {capability:request.capability,provider:this.id,success:true,output:calculatePumpHydraulicPower(request.input).result};
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
