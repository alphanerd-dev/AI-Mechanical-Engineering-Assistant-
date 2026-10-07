import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {AgentActionProposal,AgentRunLimits} from "../agents/runtime.js";
import {runBoundedAutonomy,BoundedAutonomyReport} from "../orchestration/bounded-autonomy.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";

export class BoundedAutonomyProvider implements EngineeringProvider{
  readonly id="bounded-agent";
  readonly capabilities=["AGENT.RUN_BOUNDED"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"orchestration",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"1.0"
  };

  constructor(private readonly router:CapabilityRouter){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="AGENT.RUN_BOUNDED")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported bounded autonomy capability."};

    const input=request.input;
    const runId=typeof input.runId==="string"?input.runId:"";
    const taskGraph=input.taskGraph as EngineeringTaskGraph|undefined;
    const actions=input.actions as readonly AgentActionProposal[]|undefined;
    const limits=input.limits as AgentRunLimits|undefined;

    if(!runId.trim()) return {capability:request.capability,provider:this.id,success:false,error:"runId is required."};
    if(!taskGraph) return {capability:request.capability,provider:this.id,success:false,error:"A task graph is required."};
    if(!actions||!Array.isArray(actions)) return {capability:request.capability,provider:this.id,success:false,error:"Agent actions must be an array."};
    if(!limits) return {capability:request.capability,provider:this.id,success:false,error:"Agent limits are required."};

    try{
      const report:BoundedAutonomyReport=await runBoundedAutonomy({
        runId,
        taskGraph,
        actions,
        limits,
        project:request.input.project as Parameters<typeof runBoundedAutonomy>[0]["project"]
      },this.router);
      return {
        capability:request.capability,
        provider:this.id,
        success:report.status==="COMPLETED",
        output:report,
        evidenceIds:report.evidenceIds,
        artifactIds:report.artifactIds,
        error:report.status==="COMPLETED"?undefined:report.stopReason
      };
    }catch(error){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:error instanceof Error?error.message:"Bounded autonomy execution failed."
      };
    }
  }
}
