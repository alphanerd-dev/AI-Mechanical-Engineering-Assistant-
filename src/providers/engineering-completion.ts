import {CapabilityProvider} from "../capabilities/registry";
import {CapabilityRequest,CapabilityResult} from "../core/types";
import {CapabilityRouter} from "../capabilities/router";
import {ShaftEngineeringCompletionRequest} from "../completion/types";
import {completeShaftEngineeringUnit} from "../completion/shaft";

export class EngineeringCompletionProvider implements CapabilityProvider{
  id="engineering-completion";
  capabilities=["ENGINEERING.COMPLETE_SHAFT"];

  constructor(private readonly router:CapabilityRouter){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ENGINEERING.COMPLETE_SHAFT"){
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported engineering completion capability."};
    }
    try{
      const report=await completeShaftEngineeringUnit(
        request.input as unknown as ShaftEngineeringCompletionRequest,
        this.router
      );
      return {
        capability:request.capability,
        provider:this.id,
        success:report.status==="COMPLETE"||report.status==="WAITING_APPROVAL"||report.status==="BLOCKED",
        output:report,
        error:report.status==="FAILED"?report.nextAction:undefined,
        evidenceIds:report.lineage.evidenceIds,
        artifactIds:report.lineage.artifactIds
      };
    }catch(error){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:error instanceof Error?error.message:"Engineering completion failed."
      };
    }
  }
}
