import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";

export interface OcctExecutor {
  call(operation:string,input:Record<string,unknown>):Promise<unknown>;
}

export class OcctProvider implements CapabilityProvider {
  readonly id="cad.occt";
  readonly capabilities=["CAD.VALIDATE_GEOMETRY","CAD.EXPORT_STEP"];
  constructor(private readonly executor:OcctExecutor){}
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    const operation=request.capability==="CAD.VALIDATE_GEOMETRY"?"validate_geometry":
      request.capability==="CAD.EXPORT_STEP"?"export_step":undefined;
    if(!operation) return {capability:request.capability,provider:this.id,success:false,error:"Unsupported OCCT capability"};
    try {
      return {capability:request.capability,provider:this.id,success:true,
        output:await this.executor.call(operation,request.input)};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
