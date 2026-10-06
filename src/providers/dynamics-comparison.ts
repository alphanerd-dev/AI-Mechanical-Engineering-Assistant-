import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {compareMultibodyDynamicsResults,DynamicsComparisonCriterion} from "../dynamics/comparison.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {MultibodyDynamicsResult} from "../dynamics/types.js";

export class DynamicsComparisonProvider implements EngineeringProvider{
  readonly id="dynamics.comparison";
  readonly capabilities=["DYNAMICS.COMPARE_SOLVERS"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"dynamics",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"1.0"
  };

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="DYNAMICS.COMPARE_SOLVERS")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported dynamics comparison capability."};

    const reference=request.input.referenceResult as MultibodyDynamicsResult|undefined;
    const candidate=request.input.candidateResult as MultibodyDynamicsResult|undefined;
    const criteria=request.input.criteria as DynamicsComparisonCriterion[]|undefined;
    if(!reference||!candidate||!Array.isArray(criteria))
      return {capability:request.capability,provider:this.id,success:false,error:"Reference result, candidate result, and comparison criteria are required."};

    const output=compareMultibodyDynamicsResults(
      reference,
      candidate,
      criteria,
      request.input.requireConverged===undefined?true:Boolean(request.input.requireConverged)
    );
    return {capability:request.capability,provider:this.id,success:output.status==="MATCH",output};
  }
}
