import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {DynamicsProvider} from "./contracts.js";
import {MultibodyDynamicsInput,MultibodyDynamicsResult} from "../dynamics/types.js";
import {validateMultibodyDynamicsModel,validateMultibodyDynamicsResult} from "../dynamics/validation.js";

export interface MultibodyDynamicsExecutor{
  simulate(input:MultibodyDynamicsInput):Promise<MultibodyDynamicsResult>;
}

export class MultibodyDynamicsProvider implements DynamicsProvider{
  readonly id="dynamics.multibody";
  readonly capabilities=["DYNAMICS.SIMULATE_MULTIBODY"];
  readonly descriptor={
    id:this.id,
    domain:"dynamics" as const,
    status:"PILOT" as const,
    version:"1.0",
    capabilities:this.capabilities,
    requires:["multibody dynamics solver runtime"]
  };

  constructor(private readonly executor:MultibodyDynamicsExecutor){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="DYNAMICS.SIMULATE_MULTIBODY")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported dynamics capability."};
    const input=request.input as unknown as MultibodyDynamicsInput;
    try{
      const validation=validateMultibodyDynamicsModel(input.model);
      if(!validation.valid)
        return {capability:request.capability,provider:this.id,success:false,error:validation.errors.join("; ")};
      if(!Number.isFinite(input.timeStepS)||input.timeStepS<=0)
        return {capability:request.capability,provider:this.id,success:false,error:"timeStepS must be positive and finite."};
      if(!Number.isFinite(input.durationS)||input.durationS<=0)
        return {capability:request.capability,provider:this.id,success:false,error:"durationS must be positive and finite."};
      const output=await this.executor.simulate(input);
      if(!validateMultibodyDynamicsResult(output))
        return {capability:request.capability,provider:this.id,success:false,error:"Dynamics provider returned an invalid result."};
      return {capability:request.capability,provider:this.id,success:true,output};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
