import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {EngineeringWorkflowEngine} from "../orchestration/engine.js";
import {EngineeringWorkflowPlan,EngineeringOrchestratorContext} from "../orchestration/types.js";
import {CapabilityRouter} from "../capabilities/router.js";

export class EngineeringOrchestratorProvider implements EngineeringProvider{
  readonly id="engineering-orchestrator";
  readonly capabilities=["ENGINEERING.ORCHESTRATE_WORKFLOW"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"orchestration",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"1.0"
  };

  constructor(private readonly router:CapabilityRouter){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ENGINEERING.ORCHESTRATE_WORKFLOW")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported orchestration capability."};

    const plan=request.input.plan;
    if(!plan||typeof plan!=="object")
      return {capability:request.capability,provider:this.id,success:false,error:"A workflow plan is required."};

    try{
      const report=await new EngineeringWorkflowEngine(this.router).execute(
        plan as EngineeringWorkflowPlan,
        request.input.context as EngineeringOrchestratorContext|undefined
      );
      return {
        capability:request.capability,
        provider:this.id,
        success:report.status==="COMPLETE",
        output:report,
        error:report.status==="COMPLETE"?undefined:`Workflow status: ${report.status}.`,
        evidenceIds:report.traceabilityLinks.flatMap(link=>link.evidenceIds??[])
      };
    }catch(error){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:error instanceof Error?error.message:"Workflow orchestration failed."
      };
    }
  }
}
