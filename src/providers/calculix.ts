import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {FEAStaticStructuralRequest,FEAStaticStructuralResult} from "../fea/types.js";
import {validateStaticStructuralRequest} from "../fea/validation.js";

export interface CalculixExecutor{
  runStaticStructural(request:FEAStaticStructuralRequest):Promise<FEAStaticStructuralResult>;
}

export class CalculixProvider implements EngineeringProvider{
  readonly id="open.calculix";
  readonly capabilities=["ANALYSIS.STATIC_STRUCTURAL"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"simulation",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"2.20"
  };

  constructor(private readonly executor:CalculixExecutor){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ANALYSIS.STATIC_STRUCTURAL"){
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported CalculiX capability"};
    }
    const input=request.input as unknown as FEAStaticStructuralRequest;
    const errors=validateStaticStructuralRequest(input);
    if(errors.length){
      return {capability:request.capability,provider:this.id,success:false,error:errors.join(" ")};
    }
    try{
      const output=await this.executor.runStaticStructural(input);
      return {
        capability:request.capability,
        provider:this.id,
        success:output.exitCode===0,
        output,
        error:output.exitCode===0?undefined:"CalculiX returned a non-zero exit code."
      };
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"CalculiX provider failed"};
    }
  }
}
