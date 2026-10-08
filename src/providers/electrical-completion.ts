import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {DcLoadEngineeringCompletionRequest,completeDcLoadEngineeringUnit} from "../completion/electrical";

export class ElectricalEngineeringCompletionProvider implements CapabilityProvider{
  id="electrical-engineering-completion";
  capabilities=["ENGINEERING.COMPLETE_DC_LOAD"];

  constructor(private readonly router:CapabilityRouter){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ENGINEERING.COMPLETE_DC_LOAD"){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:"Unsupported electrical completion capability."
      };
    }

    try{
      const report=await completeDcLoadEngineeringUnit(
        request.input as unknown as DcLoadEngineeringCompletionRequest,
        this.router
      );
      const accepted=report.status==="COMPLETE"||report.status==="WAITING_APPROVAL"||report.status==="BLOCKED";
      return {
        capability:request.capability,
        provider:this.id,
        success:accepted,
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
        error:error instanceof Error?error.message:"Electrical completion failed."
      };
    }
  }
}
