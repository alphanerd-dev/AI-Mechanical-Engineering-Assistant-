import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider} from "./contracts.js";
import {DigitalThreadGraph,DigitalThreadLink} from "../digital-thread/types.js";

export class DigitalThreadProvider implements EngineeringProvider{
  readonly id="digital-thread.core";
  readonly capabilities=["DIGITAL_THREAD.LINK"];
  readonly descriptor={
    id:this.id,
    domain:"validation" as const,
    status:"PILOT" as const,
    version:"1.0",
    capabilities:this.capabilities
  };
  readonly graph=new DigitalThreadGraph();

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="DIGITAL_THREAD.LINK")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported digital-thread capability."};
    const link=request.input.link as DigitalThreadLink|undefined;
    if(!link) return {capability:request.capability,provider:this.id,success:false,error:"A digital-thread link is required."};
    try{
      const stored=this.graph.addLink(link);
      return {capability:request.capability,provider:this.id,success:true,output:stored,evidenceIds:stored.evidenceIds};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
