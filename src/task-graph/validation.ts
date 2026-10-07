import {EngineeringTaskGraph,EngineeringTask,EngineeringTaskTransition} from "./types.js";

const allowed:Record<EngineeringTask[ "status"],EngineeringTaskTransition[]>={
  PROPOSED:["READY","BLOCKED"],
  READY:["RUNNING","BLOCKED"],
  RUNNING:["COMPLETED","FAILED","BLOCKED"],
  BLOCKED:["READY"],
  COMPLETED:["VERIFIED"],
  FAILED:["READY","BLOCKED"],
  VERIFIED:[]
};

export function validateEngineeringTaskGraph(graph:EngineeringTaskGraph):string[]{
  const errors:string[]=[];
  if(!graph.id.trim()) errors.push("Task graph id is required.");
  if(!graph.projectId.trim()) errors.push("Task graph project id is required.");
  if(!Number.isInteger(graph.revision)||graph.revision<1) errors.push("Task graph revision must be a positive integer.");

  const ids=new Set<string>();
  for(const task of graph.tasks){
    if(!task.id.trim()) errors.push("Engineering task id is required.");
    if(ids.has(task.id)) errors.push(`Duplicate engineering task id: ${task.id}.`);
    ids.add(task.id);
    if(task.projectId!==graph.projectId) errors.push(`Engineering task belongs to another project: ${task.id}.`);
    if(!task.name.trim()) errors.push(`Engineering task name is required: ${task.id}.`);
    if(!task.goal.trim()) errors.push(`Engineering task goal is required: ${task.id}.`);
    if(!Number.isInteger(task.maxAttempts??1)||(task.maxAttempts??1)<1) errors.push(`Engineering task maxAttempts must be a positive integer: ${task.id}.`);
    if(!Number.isInteger(Date.parse(task.createdAt))||!Number.isInteger(Date.parse(task.updatedAt))) errors.push(`Engineering task timestamps must be valid: ${task.id}.`);
    for(const dependency of task.dependsOn??[]){
      if(dependency===task.id) errors.push(`Engineering task cannot depend on itself: ${task.id}.`);
    }
    for(const transition of allowed[task.status]??[]){
      if(!transition) errors.push(`Invalid task transition definition: ${task.id}.`);
    }
  }

  for(const task of graph.tasks){
    for(const dependency of task.dependsOn??[]){
      if(!ids.has(dependency)) errors.push(`Engineering task dependency not found: ${task.id} -> ${dependency}.`);
    }
    for(const requirementId of task.requiredRequirementIds??[]){
      if(!requirementId.trim()) errors.push(`Engineering task requirement id must not be empty: ${task.id}.`);
    }
  }

  const byId=new Map(graph.tasks.map(task=>[task.id,task]));
  const visiting=new Set<string>();
  const visited=new Set<string>();
  const visit=(id:string):void=>{
    if(visiting.has(id)){errors.push(`Engineering task dependency cycle detected at: ${id}.`);return;}
    if(visited.has(id)) return;
    visiting.add(id);
    for(const dependency of byId.get(id)?.dependsOn??[]) if(byId.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for(const task of graph.tasks) visit(task.id);

  return [...new Set(errors)];
}

export function canTransitionTask(status:EngineeringTask["status"],to:EngineeringTaskTransition):boolean{
  return allowed[status].includes(to);
}

export function transitionTask(
  graph:EngineeringTaskGraph,
  taskId:string,
  to:EngineeringTaskTransition,
  updatedAt=new Date().toISOString()
):EngineeringTaskGraph{
  const errors=validateEngineeringTaskGraph(graph);
  if(errors.length) throw new Error(errors.join(" "));
  const index=graph.tasks.findIndex(task=>task.id===taskId);
  if(index<0) throw new Error(`Engineering task not found: ${taskId}.`);
  const task=graph.tasks[index];
  if(!canTransitionTask(task.status,to)) throw new Error(`Invalid engineering task transition: ${task.status} -> ${to}.`);
  const next=structuredClone(graph);
  next.revision++;
  next.tasks[index]={
    ...task,
    status:to,
    blockedReason:to==="BLOCKED"?task.blockedReason:undefined,
    updatedAt
  };
  return next;
}
