import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {FEAModelInput,FEAResult} from "../simulation/types.js";
export interface PyMechanicalWorkerExecutor{runStaticStructural(input:FEAModelInput):Promise<FEAResult>;}
export class PyMechanicalWorkerProvider {
 readonly id="ansys.pymechanical-worker";
 readonly capabilities=["ANALYSIS.STATIC_STRUCTURAL"];
 constructor(private readonly executor:PyMechanicalWorkerExecutor){}
 async execute(request:CapabilityRequest):Promise<CapabilityResult>{
  if(request.capability!=="ANALYSIS.STATIC_STRUCTURAL") return {capability:request.capability,provider:this.id,success:false,error:"Unsupported FEA capability"};
  try{
   const output=await this.executor.runStaticStructural(request.input as unknown as FEAModelInput);
   return {capability:request.capability,provider:this.id,success:true,output};
  }catch(error){return {capability:request.capability,provider:this.id,success:false,error:String(error)};}
 }
}
