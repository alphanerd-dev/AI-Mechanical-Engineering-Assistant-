import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";

export interface OdooPlmExecutor {
  call(operation:string,input:Record<string,unknown>):Promise<unknown>;
}

export class OdooPlmProvider implements CapabilityProvider {
  readonly id="plm.odooplm";
  readonly capabilities=["PLM.QUERY_ITEM","PLM.CREATE_REVISION"];
  constructor(private readonly executor:OdooPlmExecutor){}
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    const operation=request.capability==="PLM.QUERY_ITEM"?"query_item":
      request.capability==="PLM.CREATE_REVISION"?"create_revision":undefined;
    if(!operation) return {capability:request.capability,provider:this.id,success:false,error:"Unsupported OdooPLM capability"};
    try {
      return {capability:request.capability,provider:this.id,success:true,
        output:await this.executor.call(operation,request.input)};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
