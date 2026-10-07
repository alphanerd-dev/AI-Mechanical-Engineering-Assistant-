import {ProjectState} from "../core/types.js";
import {EngineeringTask,EngineeringTaskGraph,ReadyTaskEvaluation} from "./types.js";
import {validateEngineeringTaskGraph} from "./validation.js";

function requirementsSatisfied(task:EngineeringTask,project:ProjectState|undefined):string[]{
  const required=task.requiredRequirementIds??[];
  if(required.length===0) return [];
  if(!project) return ["Project state is required to verify task requirements."];
  return required.filter(id=>{
    const req=project.requirements.find(item=>item.id===id);
    return !req||req.status!=="SATISFIED";
  }).map(id=>`Requirement is not satisfied: ${id}.`);
}

export function evaluateTaskReady(
  graph:EngineeringTaskGraph,
  taskId:string,
  project?:ProjectState
):ReadyTaskEvaluation{
  const graphErrors=validateEngineeringTaskGraph(graph);
  if(graphErrors.length) return {taskId,ready:false,reasons:graphErrors};
  const task=graph.tasks.find(item=>item.id===taskId);
  if(!task) return {taskId,ready:false,reasons:[`Engineering task not found: ${taskId}.`]};
  if(task.status!=="PROPOSED"&&task.status!=="FAILED"&&task.status!=="BLOCKED")
    return {taskId,ready:false,reasons:[`Task status ${task.status} is not eligible for ready evaluation.`]};
  const byId=new Map(graph.tasks.map(item=>[item.id,item]));
  const reasons:string[]=[];
  for(const dependencyId of task.dependsOn??[]){
    const dependency=byId.get(dependencyId)!;
    if(dependency.status!=="COMPLETED"&&dependency.status!=="VERIFIED")
      reasons.push(`Dependency is not complete: ${dependencyId}.`);
  }
  reasons.push(...requirementsSatisfied(task,project));
  if(task.approvalRequired&&!task.approvalGranted)
    reasons.push("Explicit human approval is required before this task can become READY.");
  if(task.capability===undefined||!task.capability.trim())
    reasons.push("Engineering capability is required before this task can become READY.");
  return {taskId,ready:reasons.length===0,reasons};
}

export function getReadyTasks(
  graph:EngineeringTaskGraph,
  project?:ProjectState
):ReadyTaskEvaluation[]{
  return graph.tasks
    .filter(task=>task.status==="PROPOSED"||task.status==="FAILED"||task.status==="BLOCKED")
    .map(task=>evaluateTaskReady(graph,task.id,project));
}
