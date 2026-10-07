import {CapabilityRouter} from "../capabilities/router.js";
import {ProjectState} from "../core/types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import {canTransitionTask,transitionTask} from "../task-graph/validation.js";
import {EngineeringWorkflowEngine} from "./engine.js";
import {EngineeringWorkflowStage,EngineeringWorkflowStepResult} from "./types.js";

export interface TaskGraphExecutionRequest{
  graph:EngineeringTaskGraph;
  taskId:string;
  stage:EngineeringWorkflowStage;
  project?:ProjectState;
}

export interface TaskGraphExecutionResult{
  taskId:string;
  graph:EngineeringTaskGraph;
  workflowStep:EngineeringWorkflowStepResult;
  status:"COMPLETED"|"FAILED"|"BLOCKED"|"INCOMPLETE";
  reason:string;
}

export async function executeTaskGraphTask(
  request:TaskGraphExecutionRequest,
  router:CapabilityRouter
):Promise<TaskGraphExecutionResult>{
  const task=request.graph.tasks.find(item=>item.id===request.taskId);
  if(!task) throw new Error(`Engineering task not found: ${request.taskId}.`);
  if(task.status!=="READY"){
    return {
      taskId:task.id,
      graph:request.graph,
      workflowStep:{
        stepId:task.id,
        stage:request.stage,
        status:"BLOCKED",
        attempts:0,
        trust:"UNVERIFIED",
        reason:`Task must be READY before execution; current status is ${task.status}.`
      },
      status:"BLOCKED",
      reason:`Task must be READY before execution; current status is ${task.status}.`
    };
  }

  const running=transitionTask(request.graph,task.id,"RUNNING");
  const plan={
    id:`${running.id}:task:${task.id}`,
    projectId:running.projectId,
    name:task.name,
    steps:[{
      id:task.id,
      name:task.name,
      stage:request.stage,
      capability:task.capability!,
      risk:task.risk,
      input:task.input,
      requiredRequirementIds:task.requiredRequirementIds,
      approvalRequired:task.approvalRequired,
      approvalGranted:task.approvalGranted,
      requireEvidence:task.evidenceRequired,
      maxAttempts:task.maxAttempts
    }]
  };

  const workflow=new EngineeringWorkflowEngine(router);
  const report=await workflow.execute(plan,{project:request.project});
  const step=report.steps[0];

  if(!step){
    const blocked=transitionTask(running,task.id,"BLOCKED");
    const reason="Workflow engine returned no task result.";
    const nextGraph={
      ...blocked,
      tasks:blocked.tasks.map(item=>item.id===task.id?{...item,blockedReason:reason}:item)
    };
    return {
      taskId:task.id,
      graph:nextGraph,
      workflowStep:{
        stepId:task.id,
        stage:request.stage,
        status:"INCOMPLETE",
        attempts:0,
        trust:"UNVERIFIED",
        reason
      },
      status:"INCOMPLETE",
      reason
    };
  }

  let nextGraph=running;
  let status:"COMPLETED"|"FAILED"|"BLOCKED"|"INCOMPLETE";
  if(step.status==="SUCCESS"&&canTransitionTask("RUNNING","COMPLETED")){
    nextGraph=transitionTask(nextGraph,task.id,"COMPLETED");
    status="COMPLETED";
  }else if(step.status==="FAILED"){
    nextGraph=transitionTask(nextGraph,task.id,"FAILED");
    status="FAILED";
  }else if(step.status==="BLOCKED"){
    nextGraph=transitionTask(nextGraph,task.id,"BLOCKED");
    nextGraph={
      ...nextGraph,
      tasks:nextGraph.tasks.map(item=>item.id===task.id?{...item,blockedReason:step.reason}:item)
    };
    status="BLOCKED";
  }else{
    status="INCOMPLETE";
  }

  return {taskId:task.id,graph:nextGraph,workflowStep:step,status,reason:step.reason};
}
