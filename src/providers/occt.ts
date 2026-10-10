import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";

export type OcctCapability = "CAD.VALIDATE_GEOMETRY" | "CAD.EXPORT_STEP";

export interface OcctExecutor {
  call(operation:string,input:Record<string,unknown>):Promise<unknown>;
}

const DEFAULT_OCCT_CAPABILITIES: OcctCapability[] = ["CAD.VALIDATE_GEOMETRY","CAD.EXPORT_STEP"];

export class OcctProvider implements CapabilityProvider {
  readonly id="cad.occt";
  readonly capabilities: string[];

  constructor(
    private readonly executor:OcctExecutor,
    capabilities:OcctCapability[]=DEFAULT_OCCT_CAPABILITIES
  ) {
    if (!Array.isArray(capabilities) || capabilities.length===0 ||
        capabilities.some((capability)=>!DEFAULT_OCCT_CAPABILITIES.includes(capability)) ||
        new Set(capabilities).size!==capabilities.length) {
      throw new Error("OCCT provider capabilities must be a non-empty unique allowlist of supported CAD capabilities.");
    }
    this.capabilities=[...capabilities];
  }

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    const operation=request.capability==="CAD.VALIDATE_GEOMETRY"?"validate_geometry":
      request.capability==="CAD.EXPORT_STEP"?"export_step":undefined;
    if(!operation || !this.capabilities.includes(request.capability)) {
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported OCCT capability"};
    }
    try {
      return {capability:request.capability,provider:this.id,success:true,
        output:await this.executor.call(operation,request.input)};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
