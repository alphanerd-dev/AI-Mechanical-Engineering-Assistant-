import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {InverseDynamicsInput,InverseDynamicsResult,makeInverseDynamicsResult,validateInverseDynamicsInput} from "../dynamics/inverse.js";

export interface PinocchioInverseDynamicsExecutor{
  inverseDynamics(input:InverseDynamicsInput):Promise<Record<string,number>>;
}

export class PinocchioDynamicsProvider implements EngineeringProvider{
  readonly id="dynamics.pinocchio";
  readonly capabilities=["DYNAMICS.INVERSE_DYNAMICS"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"dynamics",
    status:"EXPERIMENTAL",
    capabilities:this.capabilities,
    version:"1.0",
    requires:["Pinocchio rigid-body dynamics runtime"]
  };

  constructor(private readonly executor:PinocchioInverseDynamicsExecutor){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="DYNAMICS.INVERSE_DYNAMICS")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported Pinocchio dynamics capability."};

    const input=request.input as unknown as InverseDynamicsInput;
    const validation=validateInverseDynamicsInput(input);
    if(!validation.valid)
      return {capability:request.capability,provider:this.id,success:false,error:validation.errors.join("; ")};

    try{
      const generalizedForces=await this.executor.inverseDynamics(input);
      if(!generalizedForces||typeof generalizedForces!=="object"||
         Object.values(generalizedForces).some(value=>!Number.isFinite(value)))
        return {capability:request.capability,provider:this.id,success:false,error:"Pinocchio returned invalid generalized-force values."};

      const output:InverseDynamicsResult=makeInverseDynamicsResult("pinocchio",input,generalizedForces,validation.warnings);
      return {capability:request.capability,provider:this.id,success:true,output};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Pinocchio inverse dynamics failed."};
    }
  }
}
