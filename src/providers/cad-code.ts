import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";

export type CADCodeBackend="build123d"|"cadquery";

export interface CADCodeGenerator {
  generate(input:Record<string,unknown>):Promise<{source:string;backend:CADCodeBackend;filename:string}>;
}

export class CADCodeProvider implements CapabilityProvider {
  readonly id:string;
  readonly capabilities=["CAD.CREATE_PART"];
  constructor(private readonly backend:CADCodeBackend,private readonly generator:CADCodeGenerator){
    this.id=`cad.${backend}`;
  }
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="CAD.CREATE_PART")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported CAD code capability"};
    try {
      const artifact=await this.generator.generate(request.input);
      return {capability:request.capability,provider:this.id,success:true,output:artifact};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
