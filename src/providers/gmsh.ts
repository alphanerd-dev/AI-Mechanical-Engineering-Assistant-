import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {GmshMeshRequest,GmshMeshResult} from "../fea/types.js";
import {validateGmshMeshRequest} from "../fea/validation.js";

export interface GmshExecutor{
  generateMesh(request:GmshMeshRequest):Promise<GmshMeshResult>;
}

export class GmshProvider implements EngineeringProvider{
  readonly id="open.gmsh";
  readonly capabilities=["ANALYSIS.MESH"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"simulation",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"4.15.2"
  };

  constructor(private readonly executor:GmshExecutor){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ANALYSIS.MESH"){
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported Gmsh capability"};
    }
    const input=request.input as unknown as GmshMeshRequest;
    const errors=validateGmshMeshRequest(input);
    if(errors.length){
      return {capability:request.capability,provider:this.id,success:false,error:errors.join(" ")};
    }
    try{
      const output=await this.executor.generateMesh(input);
      return {capability:request.capability,provider:this.id,success:output.success,output,error:output.error};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Gmsh provider failed"};
    }
  }
}
