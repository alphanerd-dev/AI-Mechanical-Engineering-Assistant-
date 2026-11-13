import {CapabilityRouter} from "../capabilities/router.js";
import {CapabilityDefinition,CapabilityRisk,ProjectState} from "../core/types.js";
import {EngineeringTask,EngineeringTaskGraph} from "../task-graph/types.js";
import {evaluateTaskReady} from "../task-graph/ready.js";
import {validateEngineeringTaskGraph,transitionTask} from "../task-graph/validation.js";
import {TaskGraphExecutionResult} from "./task-graph-adapter.js";
import {AgentActionProposal,AgentRunLimits} from "../agents/runtime.js";
import {validateLimits} from "./bounded-autonomy-validation.js";
import {validateActionShape} from "./bounded-autonomy-action-validation.js";
export {BOUNDED_AUTONOMY_HARD_LIMITS} from "./bounded-autonomy-policy.js";

export interface BoundedAutonomyRequest{
  runId:string;
  taskGraph:EngineeringTaskGraph;
  actions:readonly AgentActionProposal[];
  limits:AgentRunLimits;
  project?:ProjectState;
  /** Host-owned id factory. Required only when CREATE_TASK is proposed. */
  createTaskId?:()=>string;
  /** Host-owned timestamp for deterministic tests and consistent mutation records. */
  now?:string;
}

export type BoundedAutonomyActionStatus="SUCCESS"|"FAILED"|"BLOCKED"|"WAITING_APPROVAL"|"STOPPED";

export interface BoundedAutonomyActionResult{
  index:number;
  action:AgentActionProposal;
  status:BoundedAutonomyActionStatus;
  capability?:string;
  taskId?:string;
  output?:unknown;
  reason:string;
}

export interface BoundedAutonomyReport{
  runId:string;
  projectId:string;
  initialGraphRevision:number;
  finalGraph:EngineeringTaskGraph;
  status:"COMPLETED"|"FAILED"|"WAITING_APPROVAL"|"STOPPED"|"INCOMPLETE";
  steps:number;
  taskExecutions:number;
  delegations:number;
  actions:BoundedAutonomyActionResult[];
  evidenceIds:string[];
  artifactIds:string[];
  stopReason?:string;
}

function forcedApproval(definition:CapabilityDefinition,risk:CapabilityRisk):boolean{
  return risk==="HIGH"||definition.risk==="HIGH"||definition.status!=="VERIFIED";
}

function resolveCreatedTaskIdentity(
  graph:EngineeringTaskGraph,
  request:BoundedAutonomyRequest
):{id:string;timestamp:string}{
  const id=request.createTaskId?.();
  if(!id||!id.trim()) throw new Error("Host task id factory returned an empty identifier.");
  if(graph.tasks.some(task=>task.id===id)) throw new Error("Host task id factory returned a duplicate identifier.");
  const timestamp=request.now??new Date().toISOString();
  if(Number.isNaN(Date.parse(timestamp))) throw new Error("Host task timestamp is invalid.");
  return {id,timestamp};
}

function buildCreatedTask(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>,
  definition:CapabilityDefinition,
  identity:{id:string;timestamp:string}
):EngineeringTask{
  return {
    id:identity.id,
    projectId:graph.projectId,
    name:action.name,
    goal:action.goal,
    capability:action.capability,
    risk:action.risk,
    input:structuredClone(action.input),
    ...(action.dependsOn?.length?{dependsOn:[...action.dependsOn]}:{}),
    ...(action.requiredRequirementIds?.length?{requiredRequirementIds:[...action.requiredRequirementIds]}:{}),
    approvalRequired:action.approvalRequired===true||forcedApproval(definition,action.risk),
    evidenceRequired:action.evidenceRequired===true||definition.status!=="VERIFIED"||definition.risk==="HIGH",
    status:"PROPOSED",
    createdAt:identity.timestamp,
    updatedAt:identity.timestamp
  };
}

function appendCreatedTask(
  graph:EngineeringTaskGraph,
  task:EngineeringTask
):EngineeringTaskGraph{
  const next:EngineeringTaskGraph={
    ...structuredClone(graph),
    revision:graph.revision+1,
    tasks:[...graph.tasks,task]
  };
  const errors=validateEngineeringTaskGraph(next);
  if(errors.length) throw new Error("Proposed task failed graph validation: "+errors.join(" "));
  return next;
}

function applyCreateTask(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>,
  request:BoundedAutonomyRequest,
  router:CapabilityRouter
):{graph:EngineeringTaskGraph;task:EngineeringTask}{
  const definition=router.getDefinition(action.capability);
  if(!definition) throw new Error("Registered capability definition disappeared before task creation.");
  const identity=resolveCreatedTaskIdentity(graph,request);
  const task=buildCreatedTask(graph,action,definition,identity);
  return {graph:appendCreatedTask(graph,task),task};
}

function taskUpdateReasoning(task:EngineeringTask):EngineeringTask["reasoning"]{
  if(!task.reasoning) return undefined;
  return {...task.reasoning,routingDecision:undefined,records:[]};
}

type UpdateTaskPatch=Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>["patch"];

function updatedTaskFields(current:EngineeringTask,patch:UpdateTaskPatch):Partial<EngineeringTask>{
  return {
    ...(patch.name===undefined?{}:{name:patch.name}),
    ...(patch.goal===undefined?{}:{goal:patch.goal}),
    capability:patch.capability??current.capability,
    risk:patch.risk??current.risk,
    input:patch.input===undefined?structuredClone(current.input):structuredClone(patch.input)
  };
}

function updatedTaskRequirements(patch:UpdateTaskPatch):Partial<EngineeringTask>{
  return {
    ...(patch.dependsOn===undefined?{}:{dependsOn:[...patch.dependsOn]}),
    ...(patch.requiredRequirementIds===undefined?{}:{requiredRequirementIds:[...patch.requiredRequirementIds]})
  };
}

function updatedTaskSafetyState(
  current:EngineeringTask,
  definition:CapabilityDefinition,
  risk:CapabilityRisk,
  updatedAt:string
):Partial<EngineeringTask>{
  return {
    approvalRequired:current.approvalRequired===true||forcedApproval(definition,risk),
    evidenceRequired:current.evidenceRequired===true||definition.status!=="VERIFIED"||definition.risk==="HIGH",
    approvalGranted:undefined,
    reasoning:taskUpdateReasoning(current),
    status:"PROPOSED",
    blockedReason:undefined,
    updatedAt
  };
}

function buildUpdatedTask(
  current:EngineeringTask,
  patch:UpdateTaskPatch,
  definition:CapabilityDefinition,
  updatedAt:string
):EngineeringTask{
  const risk=patch.risk??current.risk;
  return {
    ...structuredClone(current),
    ...updatedTaskFields(current,patch),
    ...updatedTaskRequirements(patch),
    ...updatedTaskSafetyState(current,definition,risk,updatedAt)
  };
}

function replaceTaskAndValidateGraph(
  graph:EngineeringTaskGraph,
  index:number,
  task:EngineeringTask
):EngineeringTaskGraph{
  const next=structuredClone(graph);
  next.revision++;
  next.tasks[index]=task;
  const errors=validateEngineeringTaskGraph(next);
  if(errors.length) throw new Error("Updated task failed graph validation: "+errors.join(" "));
  return next;
}

function findMutableTaskIndex(graph:EngineeringTaskGraph,taskId:string):number{
  const index=graph.tasks.findIndex(task=>task.id===taskId);
  if(index<0) throw new Error("Engineering task not found: "+taskId+".");
  const status=graph.tasks[index].status;
  if(["READY","RUNNING","COMPLETED","VERIFIED"].includes(status))
    throw new Error("Task is no longer mutable by an agent after readiness or execution begins.");
  return index;
}

function resolveUpdateDefinition(
  action:Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>,
  current:EngineeringTask,
  router:CapabilityRouter
):CapabilityDefinition{
  const definition=router.getDefinition(action.patch.capability??current.capability??"");
  if(!definition) throw new Error("Registered capability definition disappeared before task update.");
  return definition;
}

function resolveUpdateTimestamp(request:BoundedAutonomyRequest):string{
  const updatedAt=request.now??new Date().toISOString();
  if(Number.isNaN(Date.parse(updatedAt))) throw new Error("Host task timestamp is invalid.");
  return updatedAt;
}

function applyUpdateTask(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>,
  request:BoundedAutonomyRequest,
  router:CapabilityRouter
):EngineeringTaskGraph{
  const index=findMutableTaskIndex(graph,action.taskId);
  const current=graph.tasks[index];
  const definition=resolveUpdateDefinition(action,current,router);
  const updated=buildUpdatedTask(current,action.patch,definition,resolveUpdateTimestamp(request));
  return replaceTaskAndValidateGraph(graph,index,updated);
}

function executionResultFromCapability(output:unknown):TaskGraphExecutionResult|undefined{
  if(!output||typeof output!=="object") return undefined;
  const value=output as Partial<TaskGraphExecutionResult>;
  if(typeof value.taskId!=="string"||!value.graph||typeof value.graph!=="object") return undefined;
  return value as TaskGraphExecutionResult;
}

interface BoundedRunState{
  graph:EngineeringTaskGraph;
  createdTaskIds:Set<string>;
  taskExecutions:number;
  delegations:number;
  actions:BoundedAutonomyActionResult[];
  evidenceIds:string[];
  artifactIds:string[];
}

interface BoundedRunContext{
  request:BoundedAutonomyRequest;
  router:CapabilityRouter;
  state:BoundedRunState;
  initial:Omit<BoundedAutonomyReport,"finalGraph"|"status"|"steps"|"taskExecutions"|"delegations"|"actions"|"evidenceIds"|"artifactIds"|"stopReason">;
  hostTimestamp:string;
}

interface ActionProcessResult{
  terminalStatus?:BoundedAutonomyReport["status"];
  stopReason?:string;
  skipAction?:boolean;
}

function buildInitialReport(request:BoundedAutonomyRequest):BoundedAutonomyReport{
  return {
    runId:request.runId,
    projectId:request.taskGraph.projectId,
    initialGraphRevision:request.taskGraph.revision,
    finalGraph:structuredClone(request.taskGraph),
    status:"INCOMPLETE",
    steps:0,
    taskExecutions:0,
    delegations:0,
    actions:[],
    evidenceIds:[],
    artifactIds:[]
  };
}

function buildState(graph:EngineeringTaskGraph):BoundedRunState{
  return {
    graph:structuredClone(graph),
    createdTaskIds:new Set<string>(),
    taskExecutions:0,
    delegations:0,
    actions:[],
    evidenceIds:[],
    artifactIds:[]
  };
}

function finishReport(
  context:BoundedRunContext,
  status:BoundedAutonomyReport["status"],
  stopReason?:string
):BoundedAutonomyReport{
  const state=context.state;
  return {
    ...context.initial,
    finalGraph:state.graph,
    status,
    steps:state.actions.length,
    taskExecutions:state.taskExecutions,
    delegations:state.delegations,
    actions:state.actions,
    evidenceIds:[...new Set(state.evidenceIds)],
    artifactIds:[...new Set(state.artifactIds)],
    ...(stopReason?{stopReason}:{})
  };
}

function appendAction(context:BoundedRunContext,result:BoundedAutonomyActionResult):void{
  context.state.actions.push(result);
}

function failureOutcome(
  context:BoundedRunContext,
  result:BoundedAutonomyActionResult,
  reason:string
):ActionProcessResult{
  appendAction(context,result);
  return context.request.limits.stopOnFailure
    ?{terminalStatus:"FAILED",stopReason:reason}
    :{};
}

interface ActionFailureRequest {
  context:BoundedRunContext;
  index:number;
  action:AgentActionProposal;
  reason:string;
  capability?:string;
  output?:unknown;
}

function actionFailure(request:ActionFailureRequest):ActionProcessResult{
  const {context,index,action,reason,capability,output}=request;
  return failureOutcome(context,{
    index,action,status:"FAILED",reason,
    ...(capability?{capability}:{}),
    ...(action.kind!=="STOP"&&action.kind!=="CREATE_TASK"?{taskId:action.taskId}:{}),
    ...(output===undefined?{}:{output})
  },reason);
}

function validateActionOrBlock(
  context:BoundedRunContext,
  index:number,
  action:AgentActionProposal
):ActionProcessResult|undefined{
  if(action.kind!=="CREATE_TASK"&&action.kind!=="STOP"&&context.state.createdTaskIds.has(action.taskId)){
    const reason="A task created in this planning cycle cannot be referenced until the next model planning cycle.";
    appendAction(context,{index,action,status:"BLOCKED",taskId:action.taskId,reason});
    return context.request.limits.stopOnFailure?{terminalStatus:"FAILED",stopReason:reason}:{skipAction:true};
  }
  const errors=validateActionShape(action,{
    graph:context.state.graph,
    limits:context.request.limits,
    router:context.router,
    createTaskId:context.request.createTaskId
  });
  if(!errors.length) return undefined;
  const reason=errors.join(" ");
  appendAction(context,{index,action,status:"BLOCKED",reason});
  return context.request.limits.stopOnFailure
    ?{terminalStatus:"FAILED",stopReason:"Bounded agent action rejected by core policy: "+reason}
    :{skipAction:true};
}

function processCreateTask(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>
):ActionProcessResult{
  try{
    const created=applyCreateTask(context.state.graph,action,{
      ...context.request,now:context.hostTimestamp
    },context.router);
    context.state.graph=created.graph;
    context.state.createdTaskIds.add(created.task.id);
    appendAction(context,{
      index,action,status:"SUCCESS",taskId:created.task.id,
      reason:"Task created in PROPOSED state by the backend; readiness and approval remain separate."
    });
    return {};
  }catch(error){
    return actionFailure({context,index,action,reason:error instanceof Error?error.message:"Task creation failed."});
  }
}

function processUpdateTask(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>
):ActionProcessResult{
  try{
    context.state.graph=applyUpdateTask(context.state.graph,action,{
      ...context.request,now:context.hostTimestamp
    },context.router);
    appendAction(context,{
      index,action,status:"SUCCESS",taskId:action.taskId,
      reason:"Task updated; previous reasoning and approval grants were invalidated."
    });
    return {};
  }catch(error){
    return actionFailure({context,index,action,reason:error instanceof Error?error.message:"Task update failed."});
  }
}

function processReadinessRequest(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"REQUEST_READY"}>
):ActionProcessResult{
  const readiness=evaluateTaskReady(context.state.graph,action.taskId,context.request.project);
  if(!readiness.ready){
    const reason=readiness.reasons.join(" ");
    const waitingApproval=readiness.reasons.some(item=>item.toLowerCase().includes("approval"));
    appendAction(context,{
      index,action,status:waitingApproval?"WAITING_APPROVAL":"BLOCKED",
      taskId:action.taskId,reason
    });
    if(waitingApproval) return {terminalStatus:"WAITING_APPROVAL",stopReason:reason};
    return context.request.limits.stopOnFailure?{terminalStatus:"FAILED",stopReason:reason}:{};
  }
  try{
    context.state.graph=transitionTask(
      context.state.graph,action.taskId,"READY",context.hostTimestamp
    );
    appendAction(context,{
      index,action,status:"SUCCESS",taskId:action.taskId,
      reason:"Backend task-readiness gates passed; task transitioned to READY."
    });
    return {};
  }catch(error){
    const reason=error instanceof Error?error.message:"Task readiness transition failed.";
    return failureOutcome(context,{
      index,action,status:"BLOCKED",taskId:action.taskId,reason
    },reason);
  }
}

function processApprovalRequest(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"REQUEST_APPROVAL"}>
):ActionProcessResult{
  const task=context.state.graph.tasks.find(item=>item.id===action.taskId);
  if(!task) return actionFailure({context,index,action,reason:"Approval target task was not found."});
  if(!["PROPOSED","BLOCKED","FAILED","READY"].includes(task.status)){
    const reason="Human approval can only be requested before task execution begins.";
    appendAction(context,{index,action,status:"BLOCKED",taskId:task.id,reason});
    return context.request.limits.stopOnFailure?{terminalStatus:"FAILED",stopReason:reason}:{};
  }
  const next=structuredClone(context.state.graph);
  next.revision++;
  const taskIndex=next.tasks.findIndex(item=>item.id===task.id);
  const current=next.tasks[taskIndex];
  next.tasks[taskIndex]={
    ...current,
    status:"PROPOSED",
    approvalRequired:true,
    approvalGranted:undefined,
    reasoning:current.reasoning?{...current.reasoning,routingDecision:undefined,records:[]}:undefined,
    updatedAt:context.hostTimestamp
  };
  context.state.graph=next;
  const reason="Human approval was requested. The backend has added an approval gate; no approval was granted and no work was executed.";
  appendAction(context,{index,action,status:"WAITING_APPROVAL",taskId:task.id,reason});
  return {terminalStatus:"WAITING_APPROVAL",stopReason:action.reason};
}

function processDelegation(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"DELEGATE_SPECIALIST"}>
):Promise<ActionProcessResult>{
  if(context.state.delegations>=context.request.limits.maxDelegations){
    const reason="Bounded agent delegation budget exhausted.";
    appendAction(context,{index,action,status:"BLOCKED",reason});
    return Promise.resolve(context.request.limits.stopOnFailure?{terminalStatus:"FAILED",stopReason:reason}:{});
  }
  return executeDelegation(context,index,action);
}

async function executeDelegation(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"DELEGATE_SPECIALIST"}>
):Promise<ActionProcessResult>{
  const result=await context.router.execute({
    capability:"AGENT.DELEGATE_SPECIALIST",
    risk:"HIGH",
    input:{
      taskGraph:context.state.graph,
      taskId:action.taskId,
      specialistId:action.specialistId,
      stage:action.stage
    }
  });
  if(!result.success){
    return actionFailure({
      context,index,action,reason:result.error??"Specialist delegation failed.",
      capability:"AGENT.DELEGATE_SPECIALIST",output:result.output
    });
  }
  context.state.delegations++;
  appendAction(context,{
    index,action,status:"SUCCESS",capability:"AGENT.DELEGATE_SPECIALIST",
    taskId:action.taskId,output:result.output,
    reason:"Specialist delegation accepted by the core."
  });
  return {};
}

function executionBudgetFailure(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"EXECUTE_TASK"}>
):ActionProcessResult{
  const reason="Bounded agent task-execution budget exhausted.";
  appendAction(context,{index,action,status:"BLOCKED",reason});
  return context.request.limits.stopOnFailure?{terminalStatus:"FAILED",stopReason:reason}:{};
}

async function processExecution(
  context:BoundedRunContext,
  index:number,
  action:Extract<AgentActionProposal,{kind:"EXECUTE_TASK"}>
):Promise<ActionProcessResult>{
  if(context.state.taskExecutions>=context.request.limits.maxTaskExecutions)
    return executionBudgetFailure(context,index,action);

  const result=await context.router.execute({
    capability:"TASK_GRAPH.EXECUTE_READY",
    risk:"HIGH",
    input:{
      taskGraph:context.state.graph,
      taskId:action.taskId,
      stage:action.stage,
      project:context.request.project
    }
  });
  const execution=executionResultFromCapability(result.output);
  if(execution){
    const graphErrors=validateEngineeringTaskGraph(execution.graph);
    if(graphErrors.length){
      const reason="Task execution returned an invalid graph: "+graphErrors.join(" ");
      return actionFailure({context,index,action,reason,capability:"TASK_GRAPH.EXECUTE_READY",output:result.output});
    }
    context.state.graph=execution.graph;
  }
  if(!result.success){
    return actionFailure({
      context,index,action,reason:result.error??"Bounded task execution failed.",
      capability:"TASK_GRAPH.EXECUTE_READY",output:result.output
    });
  }
  context.state.taskExecutions++;
  context.state.evidenceIds.push(...(result.evidenceIds??[]));
  context.state.artifactIds.push(...(result.artifactIds??[]));
  appendAction(context,{
    index,action,status:"SUCCESS",capability:"TASK_GRAPH.EXECUTE_READY",
    taskId:action.taskId,output:result.output,
    reason:"READY task executed through the existing deterministic workflow boundary."
  });
  return {};
}

async function dispatchAction(
  context:BoundedRunContext,
  index:number,
  action:AgentActionProposal
):Promise<ActionProcessResult>{
  switch(action.kind){
    case "STOP":
      appendAction(context,{index,action,status:"STOPPED",reason:action.reason});
      return {terminalStatus:"STOPPED",stopReason:action.reason};
    case "CREATE_TASK": return processCreateTask(context,index,action);
    case "UPDATE_TASK": return processUpdateTask(context,index,action);
    case "REQUEST_READY": return processReadinessRequest(context,index,action);
    case "REQUEST_APPROVAL": return processApprovalRequest(context,index,action);
    case "DELEGATE_SPECIALIST": return processDelegation(context,index,action);
    case "EXECUTE_TASK": return processExecution(context,index,action);
    default: return {terminalStatus:"FAILED",stopReason:"Unsupported bounded agent action."};
  }
}

async function processAction(
  context:BoundedRunContext,
  index:number,
  action:AgentActionProposal
):Promise<ActionProcessResult>{
  const blocked=validateActionOrBlock(context,index,action);
  if(blocked?.terminalStatus||blocked?.skipAction) return blocked;
  return dispatchAction(context,index,action);
}

function validateInitialRequest(
  request:BoundedAutonomyRequest
):{initial:BoundedAutonomyReport;error?:string}{
  const initial=buildInitialReport(request);
  const errors=[...validateEngineeringTaskGraph(request.taskGraph),...validateLimits(request.limits)];
  if(errors.length) return {initial,error:errors.join(" ")};
  if(request.project&&request.project.id!==request.taskGraph.projectId)
    return {initial,error:"Agent project id does not match task graph project id."};
  return {initial};
}

/** Executes only backend-validated actions against the single registered task graph and capability router. */
export async function runBoundedAutonomy(
  request:BoundedAutonomyRequest,
  router:CapabilityRouter
):Promise<BoundedAutonomyReport>{
  const validated=validateInitialRequest(request);
  if(validated.error) return {...validated.initial,status:"FAILED",stopReason:validated.error};
  if(request.actions.length===0) {
    return {...validated.initial,status:"INCOMPLETE",stopReason:"Bounded agent action list must contain at least one action."};
  }

  const hostTimestamp=request.now??new Date().toISOString();
  if(Number.isNaN(Date.parse(hostTimestamp)))
    return {...validated.initial,status:"FAILED",stopReason:"Host execution timestamp is invalid."};

  const context:BoundedRunContext={
    request,
    router,
    state:buildState(request.taskGraph),
    initial:{
      runId:validated.initial.runId,
      projectId:validated.initial.projectId,
      initialGraphRevision:validated.initial.initialGraphRevision
    },
    hostTimestamp
  };

  for(let index=0;index<request.actions.length;index++){
    if(index>=request.limits.maxSteps)
      return finishReport(context,"STOPPED","Bounded agent step budget exhausted.");
    const outcome=await processAction(context,index,request.actions[index]);
    if(outcome.terminalStatus)
      return finishReport(context,outcome.terminalStatus,outcome.stopReason);
  }
  return finishReport(context,"COMPLETED");
}
