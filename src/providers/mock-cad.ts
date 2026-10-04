import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityProvider} from "../capabilities/registry.js";

export class MockCADProvider implements CapabilityProvider {
  id="mock-cad";
  capabilities=["CAD.CREATE_PART","CAD.VALIDATE_GEOMETRY","CAD.CREATE_DRAWING"];
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    return {capability:request.capability,provider:this.id,success:true,
      output:{mock:true,operation:request.capability,input:request.input}};
  }
}
