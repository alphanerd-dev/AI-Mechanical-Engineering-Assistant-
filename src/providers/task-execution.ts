import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {executeTaskGraphTask} from "../orchestration/task-graph-adapter.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import {EngineeringWorkflowStage} from "../orchestration/types.js";

export class TaskGraphExecutionProvider implements CapabilityProvider{
  readonly id="task-graph.execution";
  readonly capabilities=["TASK_GRAPH.EXECUTE_READY"];

  constructor(private readonly router:CapabilityRouter){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="TASK_GRAPH.EXECUTE_READY")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported task execution capability."};

    const graph=request.input.taskGraph as EngineeringTaskGraph|undefined;
    const taskId=String(request.input.taskId??"");
    const stage=(request.input.stage??"ANALYSIS") as EngineeringWorkflowStage;
    if(!graph||!taskId) return {capability:request.capability,provider:this.id,success:false,error:"taskGraph and taskId are required."};

    try{
      const result=await executeTaskGraphTask({
        graph,
        taskId,
        stage,
        project:request.input.project as Parameters<typeof executeTaskGraphTask>[0]["project"]
      },this.router);
      return {
        capability:request.capability,
        provider:this.id,
        success:result.status==="COMPLETED",
        output:result,
        evidenceIds:result.workflowStep.capabilityResult?.evidenceIds,
        artifactIds:result.workflowStep.capabilityResult?.artifactIds,
        error:result.status==="COMPLETED"?undefined:result.reason
      };
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Task execution failed."};
    }
  }
}
