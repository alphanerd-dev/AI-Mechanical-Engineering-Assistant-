import {CapabilityRouter} from "../capabilities/router.js";
import {CapabilityDefinition,CapabilityRisk,ProjectState} from "../core/types.js";
import {EngineeringTask,EngineeringTaskGraph} from "../task-graph/types.js";
import {evaluateTaskReady} from "../task-graph/ready.js";
import {validateEngineeringTaskGraph,transitionTask} from "../task-graph/validation.js";
import {TaskGraphExecutionResult} from "./task-graph-adapter.js";
import {AgentActionProposal,AgentRunLimits} from "../agents/runtime.js";

export const BOUNDED_AUTONOMY_HARD_LIMITS={
  maxSteps:25,
  maxTaskExecutions:10,
  maxDelegations:10,
  maxRisk:"HIGH" as CapabilityRisk,
  maxTaskGraphSize:500
} as const;

const riskRank:Record<CapabilityRisk,number>={LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4};
const taskRiskRank:Record<CapabilityRisk,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};

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

function withinRiskLimit(risk:CapabilityRisk,limit:CapabilityRisk):boolean{
  return riskRank[risk]<=riskRank[limit];
}

function validateCountLimits(limits:AgentRunLimits):string[]{
  const errors:string[]=[];
  const values=[
    ["maxSteps",limits.maxSteps,1,BOUNDED_AUTONOMY_HARD_LIMITS.maxSteps],
    ["maxTaskExecutions",limits.maxTaskExecutions,0,BOUNDED_AUTONOMY_HARD_LIMITS.maxTaskExecutions],
    ["maxDelegations",limits.maxDelegations,0,BOUNDED_AUTONOMY_HARD_LIMITS.maxDelegations]
  ] as const;
  for(const [name,value,minimum,maximum] of values){
    if(!Number.isInteger(value)||value<minimum) errors.push("Agent "+name+" must be an integer of at least "+minimum+".");
    else if(value>maximum) errors.push("Agent "+name+" exceeds hard limit "+maximum+".");
  }
  return errors;
}

function validateRiskLimit(limits:AgentRunLimits):string[]{
  return withinRiskLimit(limits.maxRisk,BOUNDED_AUTONOMY_HARD_LIMITS.maxRisk)
    ?[]
    :["Agent maxRisk "+limits.maxRisk+" exceeds hard ceiling "+BOUNDED_AUTONOMY_HARD_LIMITS.maxRisk+"."];
}

function validateAllowlistLimits(limits:AgentRunLimits):string[]{
  const errors:string[]=[];
  if(limits.requireCapabilityAllowlist===true&&(!Array.isArray(limits.allowedCapabilities)||limits.allowedCapabilities.length===0))
    errors.push("A non-empty host capability allowlist is required for model-directed execution.");
  if(limits.requireSpecialistAllowlist===true&&(!Array.isArray(limits.allowedSpecialists)||limits.allowedSpecialists.length===0))
    errors.push("A non-empty host specialist allowlist is required for model-directed delegation.");
  if(limits.allowedCapabilities&&new Set(limits.allowedCapabilities).size!==limits.allowedCapabilities.length)
    errors.push("Agent capability allowlist cannot contain duplicate ids.");
  if(limits.allowedSpecialists&&new Set(limits.allowedSpecialists).size!==limits.allowedSpecialists.length)
    errors.push("Agent specialist allowlist cannot contain duplicate ids.");
  return errors;
}

function validateLimits(limits:AgentRunLimits):string[]{
  return [...new Set([
    ...validateCountLimits(limits),
    ...validateRiskLimit(limits),
    ...validateAllowlistLimits(limits)
  ])];
}

function isPlainRecord(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==="object"&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
}

function isJsonValue(value:unknown,seen=new Set<object>()):boolean{
  if(value===null||typeof value==="string"||typeof value==="boolean") return true;
  if(typeof value==="number") return Number.isFinite(value);
  if(typeof value!=="object") return false;
  if(seen.has(value)) return false;
  seen.add(value);
  let valid:boolean;
  if(Array.isArray(value)){
    valid=Object.keys(value).length===value.length&&Object.getOwnPropertySymbols(value).length===0&&
      value.every(item=>isJsonValue(item,seen));
  }else{
    const prototype=Object.getPrototypeOf(value);
    valid=(prototype===Object.prototype||prototype===null)&&Object.getOwnPropertySymbols(value).length===0&&
      Object.values(value as Record<string,unknown>).every(item=>isJsonValue(item,seen));
  }
  seen.delete(value);
  return valid;
}

function getPath(input:Record<string,unknown>,path:string):unknown{
  return path.split(".").reduce<unknown>((value,key)=>{
    if(!value||typeof value!=="object"||Array.isArray(value)) return undefined;
    return (value as Record<string,unknown>)[key];
  },input);
}

function missing(value:unknown):boolean{
  if(value===undefined||value===null) return true;
  if(typeof value==="string") return value.trim().length===0;
  if(Array.isArray(value)) return value.length===0;
  if(isPlainRecord(value)) return Object.keys(value).length===0;
  return false;
}

function inputPathErrors(
  value:Record<string,unknown>,
  allowedPaths:readonly string[],
  prefix=""
):string[]{
  const errors:string[]=[];
  for(const [key,child] of Object.entries(value)){
    const path=prefix?prefix+"."+key:key;
    const descendants=allowedPaths.filter(candidate=>candidate.startsWith(path+"."));
    if(!allowedPaths.includes(path)&&descendants.length===0){
      errors.push("Task input contains a field outside the registered capability contract: "+path+".");
      continue;
    }
    if(descendants.length>0){
      if(!isPlainRecord(child)){
        errors.push("Task input path must be an object to satisfy the registered nested contract: "+path+".");
      }else{
        errors.push(...inputPathErrors(child,allowedPaths,path));
      }
    }
  }
  return errors;
}

/** CapabilityDefinition records permitted input paths; providers validate domain-specific types. */
function capabilityInputErrors(
  definition:CapabilityDefinition,
  input:Record<string,unknown>,
  requireAll:boolean
):string[]{
  if(!isPlainRecord(input)||!isJsonValue(input)){
    return ["Task capability input must be a plain, finite JSON object."];
  }
  const errors=inputPathErrors(input,definition.inputs);
  if(requireAll){
    for(const path of definition.inputs){
      if(missing(getPath(input,path))) errors.push("Required capability input is missing: "+path+".");
    }
  }
  const serialized=JSON.stringify(input);
  if(serialized.length>64_000) errors.push("Task capability input exceeds the 64 KB limit.");
  return [...new Set(errors)];
}

function isControlPlaneCapability(capability:string):boolean{
  return /^(AGENT|TASK_GRAPH|WORKSPACE)\./.test(capability)||
    capability==="ENGINEERING.ORCHESTRATE_WORKFLOW"||
    capability==="ENGINEERING.ENTER_FROM_INTENT";
}

function capabilityErrors(
  capability:string,
  risk:CapabilityRisk,
  input:Record<string,unknown>,
  limits:AgentRunLimits,
  router:CapabilityRouter,
  requireAllInputs:boolean
):{definition?:CapabilityDefinition;errors:string[]}{
  const errors:string[]=[];
  if(isControlPlaneCapability(capability)){
    return {errors:["Task capability cannot target an orchestration/control-plane operation: "+capability+"."]};
  }
  const definition=router.getDefinition(capability);
  if(!definition) return {errors:["Registered capability definition not found: "+capability+"."]};
  if(definition.status==="BLOCKED"||definition.status==="DEPRECATED")
    errors.push("Capability is blocked or deprecated: "+capability+".");
  if(!router.hasExecutableProvider(capability))
    errors.push("No executable provider is registered for capability: "+capability+".");
  if(taskRiskRank[risk]<taskRiskRank[definition.risk])
    errors.push("Task risk cannot be lower than its registered capability risk: "+risk+" < "+definition.risk+".");
  if(!withinRiskLimit(risk,limits.maxRisk)||!withinRiskLimit(definition.risk,limits.maxRisk))
    errors.push("Task or capability risk exceeds the bounded agent policy.");
  if(limits.requireCapabilityAllowlist===true&&
      (!limits.allowedCapabilities||!limits.allowedCapabilities.includes(capability)))
    errors.push("Capability is outside the required host allowlist: "+capability+".");
  else if(limits.allowedCapabilities?.length&&!limits.allowedCapabilities.includes(capability))
    errors.push("Capability is outside the bounded agent policy: "+capability+".");
  errors.push(...capabilityInputErrors(definition,input,requireAllInputs));
  return {definition,errors:[...new Set(errors)]};
}

function taskForAction(graph:EngineeringTaskGraph,action:AgentActionProposal):EngineeringTask|undefined{
  if(action.kind==="STOP"||action.kind==="CREATE_TASK") return undefined;
  return graph.tasks.find(task=>task.id===action.taskId);
}

function validateCreateDependencies(graph:EngineeringTaskGraph,action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>):string[]{
  const errors:string[]=[];
  if(action.dependsOn!==undefined&&!Array.isArray(action.dependsOn)) errors.push("New task dependencies must be an array.");
  else for(const dependency of action.dependsOn??[]){
    if(typeof dependency!=="string"||!dependency.trim()) errors.push("New task dependencies must be non-empty ids.");
    else if(!graph.tasks.some(task=>task.id===dependency)) errors.push("New task dependency does not exist: "+dependency+".");
  }
  if(action.requiredRequirementIds!==undefined&&!Array.isArray(action.requiredRequirementIds))
    errors.push("New task requirement ids must be an array.");
  else for(const requirementId of action.requiredRequirementIds??[]){
    if(typeof requirementId!=="string"||!requirementId.trim()) errors.push("New task requirement ids cannot be empty.");
    else if(!/^[A-Za-z0-9._:-]{1,160}$/.test(requirementId)) errors.push("New task requirement id has an invalid format.");
  }
  return errors;
}

function validateCreateTaskAction(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>,
  limits:AgentRunLimits,
  router:CapabilityRouter,
  createTaskId?:()=>string
):string[]{
  const errors:string[]=[];
  if(limits.allowTaskCreation!==true) errors.push("Task creation is not enabled by the host policy.");
  if(!createTaskId) errors.push("A host-owned task id factory is required for task creation.");
  if(graph.tasks.length>=BOUNDED_AUTONOMY_HARD_LIMITS.maxTaskGraphSize)
    errors.push("Engineering task graph reached its hard size limit.");
  if(typeof action.name!=="string"||!action.name.trim()||action.name.length>160)
    errors.push("New task name must contain 1-160 characters.");
  if(typeof action.goal!=="string"||!action.goal.trim()||action.goal.length>2_000)
    errors.push("New task goal must contain 1-2000 characters.");
  errors.push(...capabilityErrors(action.capability,action.risk,action.input,limits,router,false).errors);
  errors.push(...validateCreateDependencies(graph,action));
  return [...new Set(errors)];
}

function validateUpdatePatchShape(patch:unknown,task:EngineeringTask):string[]{
  if(!isPlainRecord(patch)) return ["Task update patch must be a plain object."];
  const errors:string[]=[];
  const allowedKeys=["name","goal","capability","risk","input","dependsOn","requiredRequirementIds"];
  const extraKeys=Object.keys(patch).filter(key=>!allowedKeys.includes(key));
  if(extraKeys.length) errors.push("Task update patch contains unsupported fields: "+extraKeys.join(", ")+".");
  if(Object.keys(patch).length===0) errors.push("Task update patch must change at least one permitted field.");
  if(patch.name!==undefined&&(typeof patch.name!=="string"||!patch.name.trim()||patch.name.length>160))
    errors.push("Updated task name must contain 1-160 characters.");
  if(patch.goal!==undefined&&(typeof patch.goal!=="string"||!patch.goal.trim()||patch.goal.length>2_000))
    errors.push("Updated task goal must contain 1-2000 characters.");
  if(patch.capability!==undefined&&(typeof patch.capability!=="string"||!patch.capability.trim()))
    errors.push("Updated task capability must be a non-empty registered capability id.");
  if(patch.input!==undefined&&(!isPlainRecord(patch.input)||!isJsonValue(patch.input)))
    errors.push("Updated task input must be a plain, finite JSON object.");
  errors.push(...validateUpdateRisk(patch.risk,task.risk));
  errors.push(...validateUpdatedStringList(patch.dependsOn,task.dependsOn??[],"dependencies"));
  errors.push(...validateUpdatedStringList(patch.requiredRequirementIds,task.requiredRequirementIds??[],"requirement gates"));
  return errors;
}

function validateUpdateRisk(value:unknown,currentRisk:CapabilityRisk):string[]{
  if(value===undefined) return [];
  if(typeof value!=="string"||!(value in taskRiskRank)) return ["Updated task risk is invalid."];
  return taskRiskRank[value as CapabilityRisk]<taskRiskRank[currentRisk]
    ?["Agent task updates cannot lower an existing task risk."]:[];
}

function validateUpdatedStringList(value:unknown,current:readonly string[],label:string):string[]{
  if(value===undefined) return [];
  if(!Array.isArray(value)||value.some(item=>typeof item!=="string"||!item.trim()))
    return ["Updated "+label+" must be an array of non-empty strings."];
  return current.some(id=>!value.includes(id))
    ?["Agent task updates cannot remove existing "+label+"."]:[];
}

function validateUpdatedCapability(
  task:EngineeringTask,
  patch:Record<string,unknown>,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  const capability=typeof patch.capability==="string"?patch.capability:task.capability??"";
  const risk=(typeof patch.risk==="string"?patch.risk:task.risk) as CapabilityRisk;
  const input=isPlainRecord(patch.input)?patch.input:task.input;
  if(!capability.trim()) return ["An updated task must retain a registered capability."];
  const errors=capabilityErrors(capability,risk,input,limits,router,false).errors;
  const skill=task.reasoning?.skillManifest;
  if(skill&&!skill.allowedCapabilities.includes(capability))
    errors.push("Updated task capability is outside its assigned skill allowlist.");
  if(skill&&taskRiskRank[risk]>taskRiskRank[skill.maximumRisk])
    errors.push("Updated task risk exceeds its assigned skill maximum.");
  return errors;
}

function validateUpdateTaskAction(
  action:Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>,
  task:EngineeringTask|undefined,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  const errors:string[]=[];
  if(limits.allowTaskUpdates!==true) errors.push("Task updates are not enabled by the host policy.");
  if(!task) return errors;
  if(!["PROPOSED","BLOCKED","FAILED"].includes(task.status))
    errors.push("Agent task updates are allowed only before readiness or after a blocked/failed result.");
  if(!isPlainRecord(action.patch)) return [...errors,"Task update patch must be a plain object."];
  errors.push(...validateUpdatePatchShape(action.patch,task));
  errors.push(...validateUpdatedCapability(task,action.patch,limits,router));
  return [...new Set(errors)];
}

function validateReadinessAction(task:EngineeringTask|undefined,limits:AgentRunLimits,router:CapabilityRouter):string[]{
  if(!task) return [];
  const errors:string[]=[];
  if(!["PROPOSED","FAILED","BLOCKED"].includes(task.status))
    errors.push("Only a PROPOSED, FAILED or BLOCKED task can request readiness.");
  if(task.capability) errors.push(...capabilityErrors(task.capability,task.risk,task.input,limits,router,true).errors);
  return errors;
}

function validateExecutionAction(
  task:EngineeringTask|undefined,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  if(!task) return [];
  const errors=task.capability
    ?capabilityErrors(task.capability,task.risk,task.input,limits,router,true).errors
    :["Task has no registered capability to execute."];
  if(task.status!=="READY") errors.push("Task must be READY before bounded execution; current status is "+task.status+".");
  return errors;
}

function validateDelegationAction(
  action:Extract<AgentActionProposal,{kind:"DELEGATE_SPECIALIST"}>,
  task:EngineeringTask|undefined,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  const errors:string[]=[];
  if(limits.requireSpecialistAllowlist===true&&
      (!limits.allowedSpecialists||!limits.allowedSpecialists.includes(action.specialistId)))
    errors.push("Specialist is outside the required host allowlist: "+action.specialistId+".");
  else if(limits.allowedSpecialists?.length&&!limits.allowedSpecialists.includes(action.specialistId))
    errors.push("Specialist is outside the bounded agent policy: "+action.specialistId+".");
  if(!task) return errors;
  if(task.capability) errors.push(...capabilityErrors(task.capability,task.risk,task.input,limits,router,true).errors);
  else errors.push("Task has no registered capability for specialist delegation.");
  if(task.status!=="READY")
    errors.push("Task must be READY before specialist delegation; current status is "+task.status+".");
  return errors;
}

function validateActionShape(
  graph:EngineeringTaskGraph,
  action:AgentActionProposal,
  limits:AgentRunLimits,
  router:CapabilityRouter,
  createTaskId?:()=>string
):string[]{
  if(action.kind==="CREATE_TASK") return validateCreateTaskAction(graph,action,limits,router,createTaskId);
  if(action.kind==="STOP") return [];
  const task=taskForAction(graph,action);
  const errors:string[]=[];
  if(!task) errors.push("Agent action references an unknown task: "+action.taskId+".");
  if(task&&action.expectedGraphRevision!==undefined&&action.expectedGraphRevision!==graph.revision)
    errors.push("Agent action graph revision is stale: expected "+action.expectedGraphRevision+", current "+graph.revision+".");
  switch(action.kind){
    case "UPDATE_TASK": errors.push(...validateUpdateTaskAction(action,task,limits,router)); break;
    case "REQUEST_READY": errors.push(...validateReadinessAction(task,limits,router)); break;
    case "EXECUTE_TASK": errors.push(...validateExecutionAction(task,limits,router)); break;
    case "DELEGATE_SPECIALIST": errors.push(...validateDelegationAction(action,task,limits,router)); break;
    case "REQUEST_APPROVAL":
      if(typeof action.reason!=="string"||!action.reason.trim()) errors.push("Agent approval request reason is required.");
      break;
  }
  return [...new Set(errors)];
}

function forcedApproval(definition:CapabilityDefinition,risk:CapabilityRisk):boolean{
  return risk==="HIGH"||definition.risk==="HIGH"||definition.status!=="VERIFIED";
}

function applyCreateTask(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>,
  request:BoundedAutonomyRequest,
  router:CapabilityRouter
):{graph:EngineeringTaskGraph;task:EngineeringTask}{
  const definition=router.getDefinition(action.capability);
  if(!definition) throw new Error("Registered capability definition disappeared before task creation.");
  const id=request.createTaskId?.();
  if(!id||!id.trim()) throw new Error("Host task id factory returned an empty identifier.");
  if(graph.tasks.some(task=>task.id===id)) throw new Error("Host task id factory returned a duplicate identifier.");
  const createdAt=request.now??new Date().toISOString();
  if(Number.isNaN(Date.parse(createdAt))) throw new Error("Host task timestamp is invalid.");
  const task:EngineeringTask={
    id,
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
    createdAt,
    updatedAt:createdAt
  };
  const next:EngineeringTaskGraph={...structuredClone(graph),revision:graph.revision+1,tasks:[...graph.tasks,task]};
  const validation=validateEngineeringTaskGraph(next);
  if(validation.length) throw new Error("Proposed task failed graph validation: "+validation.join(" "));
  return {graph:next,task};
}

function taskUpdateReasoning(task:EngineeringTask):EngineeringTask["reasoning"]{
  if(!task.reasoning) return undefined;
  return {...task.reasoning,routingDecision:undefined,records:[]};
}

function buildUpdatedTask(
  current:EngineeringTask,
  patch:Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>["patch"],
  definition:CapabilityDefinition,
  updatedAt:string
):EngineeringTask{
  return {
    ...structuredClone(current),
    ...(patch.name===undefined?{}:{name:patch.name}),
    ...(patch.goal===undefined?{}:{goal:patch.goal}),
    capability:patch.capability??current.capability,
    risk:patch.risk??current.risk,
    input:patch.input===undefined?structuredClone(current.input):structuredClone(patch.input),
    ...(patch.dependsOn===undefined?{}:{dependsOn:[...patch.dependsOn]}),
    ...(patch.requiredRequirementIds===undefined?{}:{requiredRequirementIds:[...patch.requiredRequirementIds]}),
    approvalRequired:current.approvalRequired===true||forcedApproval(definition,patch.risk??current.risk),
    evidenceRequired:current.evidenceRequired===true||definition.status!=="VERIFIED"||definition.risk==="HIGH",
    approvalGranted:undefined,
    reasoning:taskUpdateReasoning(current),
    status:"PROPOSED",
    blockedReason:undefined,
    updatedAt
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

function applyUpdateTask(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>,
  request:BoundedAutonomyRequest,
  router:CapabilityRouter
):EngineeringTaskGraph{
  const index=graph.tasks.findIndex(task=>task.id===action.taskId);
  if(index<0) throw new Error("Engineering task not found: "+action.taskId+".");
  const current=graph.tasks[index];
  if(["READY","RUNNING","COMPLETED","VERIFIED"].includes(current.status))
    throw new Error("Task is no longer mutable by an agent after readiness or execution begins.");
  const definition=router.getDefinition(action.patch.capability??current.capability??"");
  if(!definition) throw new Error("Registered capability definition disappeared before task update.");
  const updatedAt=request.now??new Date().toISOString();
  if(Number.isNaN(Date.parse(updatedAt))) throw new Error("Host task timestamp is invalid.");
  const updated=buildUpdatedTask(current,action.patch,definition,updatedAt);
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

function actionFailure(
  context:BoundedRunContext,
  index:number,
  action:AgentActionProposal,
  reason:string,
  capability?:string,
  output?:unknown
):ActionProcessResult{
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
  const errors=validateActionShape(
    context.state.graph,action,context.request.limits,context.router,context.request.createTaskId
  );
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
    return actionFailure(context,index,action,error instanceof Error?error.message:"Task creation failed.");
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
    return actionFailure(context,index,action,error instanceof Error?error.message:"Task update failed.");
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
  if(!task) return actionFailure(context,index,action,"Approval target task was not found.");
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
    return actionFailure(
      context,index,action,result.error??"Specialist delegation failed.",
      "AGENT.DELEGATE_SPECIALIST",result.output
    );
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
      return actionFailure(context,index,action,reason,"TASK_GRAPH.EXECUTE_READY",result.output);
    }
    context.state.graph=execution.graph;
  }
  if(!result.success){
    return actionFailure(
      context,index,action,result.error??"Bounded task execution failed.",
      "TASK_GRAPH.EXECUTE_READY",result.output
    );
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

async function processAction(
  context:BoundedRunContext,
  index:number,
  action:AgentActionProposal
):Promise<ActionProcessResult>{
  const blocked=validateActionOrBlock(context,index,action);
  if(blocked?.terminalStatus||blocked?.skipAction) return blocked;
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
