import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";

export interface PyMechanicalExecutor {
  call(operation:string,input:Record<string,unknown>):Promise<unknown>;
}

export class PyMechanicalProvider implements CapabilityProvider {
  readonly id="ansys.pymechanical";
  readonly capabilities=["ANALYSIS.STATIC_STRUCTURAL"];
  constructor(private readonly executor:PyMechanicalExecutor){}
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ANALYSIS.STATIC_STRUCTURAL")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported PyMechanical capability"};
    try {
      return {capability:request.capability,provider:this.id,success:true,
        output:await this.executor.call("static_structural",request.input)};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
