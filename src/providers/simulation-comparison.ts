import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {SimulationComparisonMetric,compareSimulationResults} from "../simulation/comparison.js";
import {EngineeringProvider} from "./contracts.js";

export class SimulationComparisonProvider implements EngineeringProvider{
  readonly id="simulation.comparison";
  readonly capabilities=["SIMULATION.COMPARE_RESULTS"];
  readonly descriptor={
    id:this.id,
    domain:"simulation" as const,
    status:"PILOT" as const,
    version:"1.0",
    capabilities:this.capabilities
  };

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="SIMULATION.COMPARE_RESULTS")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported simulation comparison capability."};
    const metrics=request.input.metrics as SimulationComparisonMetric[]|undefined;
    if(!Array.isArray(metrics))
      return {capability:request.capability,provider:this.id,success:false,error:"A metrics array is required."};
    const output=compareSimulationResults(metrics);
    return {capability:request.capability,provider:this.id,success:true,output};
  }
}
