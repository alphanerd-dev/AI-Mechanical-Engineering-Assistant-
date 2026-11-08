import {CapabilityRouter} from "../capabilities/router.js";
import {CapabilityDefinition,CapabilityRisk,ProjectState} from "../core/types.js";
import {EngineeringWorkflowStage} from "./types.js";
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
const validStages:readonly EngineeringWorkflowStage[]=[
  "REQUIREMENTS","RESEARCH","COMPUTATION","ANALYSIS","CAD","SIMULATION",
  "DYNAMICS","ROBOTICS","MANUFACTURING","VALIDATION","PLM"
];

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

function validateLimits(limits:AgentRunLimits):string[]{
  const errors:string[]=[];
  if(!Number.isInteger(limits.maxSteps)||limits.maxSteps<1) errors.push("Agent maxSteps must be a positive integer.");
  if(!Number.isInteger(limits.maxTaskExecutions)||limits.maxTaskExecutions<0) errors.push("Agent maxTaskExecutions must be a non-negative integer.");
  if(!Number.isInteger(limits.maxDelegations)||limits.maxDelegations<0) errors.push("Agent maxDelegations must be a non-negative integer.");
  if(limits.maxSteps>BOUNDED_AUTONOMY_HARD_LIMITS.maxSteps)
    errors.push(`Agent maxSteps exceeds hard limit ${BOUNDED_AUTONOMY_HARD_LIMITS.maxSteps}.`);
  if(limits.maxTaskExecutions>BOUNDED_AUTONOMY_HARD_LIMITS.maxTaskExecutions)
    errors.push(`Agent maxTaskExecutions exceeds hard limit ${BOUNDED_AUTONOMY_HARD_LIMITS.maxTaskExecutions}.`);
  if(limits.maxDelegations>BOUNDED_AUTONOMY_HARD_LIMITS.maxDelegations)
    errors.push(`Agent maxDelegations exceeds hard limit ${BOUNDED_AUTONOMY_HARD_LIMITS.maxDelegations}.`);
  if(!withinRiskLimit(limits.maxRisk,BOUNDED_AUTONOMY_HARD_LIMITS.maxRisk))
    errors.push(`Agent maxRisk ${limits.maxRisk} exceeds hard ceiling ${BOUNDED_AUTONOMY_HARD_LIMITS.maxRisk}.`);
  if(limits.requireCapabilityAllowlist===true&&(!Array.isArray(limits.allowedCapabilities)||limits.allowedCapabilities.length===0))
    errors.push("A non-empty host capability allowlist is required for model-directed execution.");
  if(limits.requireSpecialistAllowlist===true&&(!Array.isArray(limits.allowedSpecialists)||limits.allowedSpecialists.length===0))
    errors.push("A non-empty host specialist allowlist is required for model-directed delegation.");
  if(limits.allowedCapabilities&&new Set(limits.allowedCapabilities).size!==limits.allowedCapabilities.length)
    errors.push("Agent capability allowlist cannot contain duplicate ids.");
  if(limits.allowedSpecialists&&new Set(limits.allowedSpecialists).size!==limits.allowedSpecialists.length)
    errors.push("Agent specialist allowlist cannot contain duplicate ids.");
  return [...new Set(errors)];
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

/** CapabilityDefinition currently records input paths, not runtime JSON types. */
function capabilityInputErrors(
  definition:CapabilityDefinition,
  input:Record<string,unknown>,
  requireAll:boolean
):string[]{
  const errors:string[]=[];
  if(!isPlainRecord(input)||!isJsonValue(input)){
    return ["Task capability input must be a plain, finite JSON object."];
  }
  const allowedRoots=new Set(definition.inputs.map(path=>path.split(".")[0]));
  const unknown=Object.keys(input).filter(key=>!allowedRoots.has(key));
  if(unknown.length) errors.push("Task input contains fields outside the registered capability contract: "+unknown.join(", ")+".");
  if(requireAll){
    for(const path of definition.inputs){
      if(missing(getPath(input,path))) errors.push("Required capability input is missing: "+path+".");
    }
  }
  let serialized:string;
  try{serialized=JSON.stringify(input);}catch{return [...errors,"Task capability input is not JSON serializable."];}
  if(serialized.length>64_000) errors.push("Task capability input exceeds the 64 KB limit.");
  return [...new Set(errors)];
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

function validateActionShape(
  graph:EngineeringTaskGraph,
  action:AgentActionProposal,
  limits:AgentRunLimits,
  router:CapabilityRouter,
  createTaskId?:()=>string
):string[]{
  const errors:string[]=[];
  if((action.kind==="DELEGATE_SPECIALIST"||action.kind==="EXECUTE_TASK")&&!validStages.includes(action.stage))
    errors.push("Agent action stage is invalid.");

  if(action.kind==="CREATE_TASK"){
    if(limits.allowTaskCreation!==true) errors.push("Task creation is not enabled by the host policy.");
    if(!createTaskId) errors.push("A host-owned task id factory is required for task creation.");
    if(graph.tasks.length>=BOUNDED_AUTONOMY_HARD_LIMITS.maxTaskGraphSize)
      errors.push("Engineering task graph reached its hard size limit.");
    if(!action.name.trim()||action.name.length>160) errors.push("New task name must contain 1-160 characters.");
    if(!action.goal.trim()||action.goal.length>2_000) errors.push("New task goal must contain 1-2000 characters.");
    const target=capabilityErrors(action.capability,action.risk,action.input,limits,router,false);
    errors.push(...target.errors);
    for(const dependency of action.dependsOn??[]){
      if(!graph.tasks.some(task=>task.id===dependency)) errors.push("New task dependency does not exist: "+dependency+".");
    }
    for(const requirementId of action.requiredRequirementIds??[]){
      if(!requirementId.trim()) errors.push("New task requirement ids cannot be empty.");
      if(limits && !(/^[A-Za-z0-9._:-]{1,160}$/).test(requirementId)) errors.push("New task requirement id has an invalid format.");
    }
    return [...new Set(errors)];
  }

  if(action.kind==="STOP") return errors;

  const task=taskForAction(graph,action);
  if(!task) errors.push("Agent action references an unknown task: "+action.taskId+".");
  if(task&&action.expectedGraphRevision!==undefined&&action.expectedGraphRevision!==graph.revision)
    errors.push(`Agent action graph revision is stale: expected ${action.expectedGraphRevision}, current ${graph.revision}.`);

  if(action.kind==="REQUEST_APPROVAL"&&!action.reason.trim())
    errors.push("Agent approval request reason is required.");

  if(action.kind==="UPDATE_TASK"){
    if(limits.allowTaskUpdates!==true) errors.push("Task updates are not enabled by the host policy.");
    if(task&& !["PROPOSED","BLOCKED","FAILED"].includes(task.status))
      errors.push("Agent task updates are allowed only before readiness or after a blocked/failed result.");
    const patch=action.patch as Record<string,unknown>;
    const patchKeys=Object.keys(patch??{});
    const allowedPatchKeys=["name","goal","capability","risk","input","dependsOn","requiredRequirementIds"];
    if(!isPlainRecord(patch)||patchKeys.length===0||patchKeys.some(key=>!allowedPatchKeys.includes(key)))
      errors.push("Task update contains an empty or unsupported patch.");
    if(task&&isPlainRecord(patch)){
      if(patch.name!==undefined&&(typeof patch.name!=="string"||!patch.name.trim()||patch.name.length>160))
        errors.push("Updated task name must contain 1-160 characters.");
      if(patch.goal!==undefined&&(typeof patch.goal!=="string"||!patch.goal.trim()||patch.goal.length>2_000))
        errors.push("Updated task goal must contain 1-2000 characters.");
      if(patch.risk!==undefined){
        if(!(patch.risk in taskRiskRank)) errors.push("Updated task risk is invalid.");
        else if(taskRiskRank[patch.risk as CapabilityRisk]<taskRiskRank[task.risk])
          errors.push("Agent task updates cannot lower an existing task risk.");
      }
      if(patch.dependsOn!==undefined){
        if(!Array.isArray(patch.dependsOn)||patch.dependsOn.some(item=>typeof item!=="string"||!item.trim()))
          errors.push("Updated dependencies must be non-empty task ids.");
        else if((task.dependsOn??[]).some(id=>!(patch.dependsOn as string[]).includes(id)))
          errors.push("Agent task updates cannot remove existing dependencies.");
      }
      if(patch.requiredRequirementIds!==undefined){
        if(!Array.isArray(patch.requiredRequirementIds)||patch.requiredRequirementIds.some(item=>typeof item!=="string"||!item.trim()))
          errors.push("Updated requirement ids must be non-empty strings.");
        else if((task.requiredRequirementIds??[]).some(id=>!(patch.requiredRequirementIds as string[]).includes(id)))
          errors.push("Agent task updates cannot remove existing requirement gates.");
      }
      const nextCapability=typeof patch.capability==="string"?patch.capability:task.capability??"";
      const nextRisk=(typeof patch.risk==="string"?patch.risk:task.risk) as CapabilityRisk;
      const nextInput=isPlainRecord(patch.input)?patch.input:task.input;
      if(!nextCapability.trim()) errors.push("An updated task must retain a registered capability.");
      else{
        const target=capabilityErrors(nextCapability,nextRisk,nextInput,limits,router,false);
        errors.push(...target.errors);
        const skill=task.reasoning?.skillManifest;
        if(skill&& !skill.allowedCapabilities.includes(nextCapability))
          errors.push("Updated task capability is outside its assigned skill allowlist.");
        if(skill&&taskRiskRank[nextRisk]>taskRiskRank[skill.maximumRisk])
          errors.push("Updated task risk exceeds its assigned skill maximum.");
      }
    }
  }

  if(action.kind==="REQUEST_READY"&&task){
    if(!["PROPOSED","FAILED","BLOCKED"].includes(task.status))
      errors.push("Only a PROPOSED, FAILED or BLOCKED task can request readiness.");
    if(task.capability){
      errors.push(...capabilityErrors(task.capability,task.risk,task.input,limits,router,true).errors);
    }
  }

  if(action.kind==="EXECUTE_TASK"&&task?.capability){
    errors.push(...capabilityErrors(task.capability,task.risk,task.input,limits,router,true).errors);
    if(task.status!=="READY")
      errors.push(`Task must be READY before bounded execution; current status is ${task.status}.`);
  }

  if(action.kind==="DELEGATE_SPECIALIST"){
    if(limits.requireSpecialistAllowlist===true&&
       (!limits.allowedSpecialists||!limits.allowedSpecialists.includes(action.specialistId)))
      errors.push("Specialist is outside the required host allowlist: "+action.specialistId+".");
    else if(limits.allowedSpecialists?.length&&!limits.allowedSpecialists.includes(action.specialistId))
      errors.push("Specialist is outside the bounded agent policy: "+action.specialistId+".");
    if(task?.capability)
      errors.push(...capabilityErrors(task.capability,task.risk,task.input,limits,router,true).errors);
    if(task&&task.status!=="READY")
      errors.push(`Task must be READY before specialist delegation; current status is ${task.status}.`);
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

function applyUpdateTask(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"UPDATE_TASK"}>,
  request:BoundedAutonomyRequest,
  router:CapabilityRouter
):EngineeringTaskGraph{
  const index=graph.tasks.findIndex(task=>task.id===action.taskId);
  if(index<0) throw new Error("Engineering task not found: "+action.taskId+".");
  const current=graph.tasks[index];
  const patch=action.patch;
  const definition=router.getDefinition(patch.capability??current.capability??"");
  if(!definition) throw new Error("Registered capability definition disappeared before task update.");
  const updatedAt=request.now??new Date().toISOString();
  if(Number.isNaN(Date.parse(updatedAt))) throw new Error("Host task timestamp is invalid.");
  const nextTask:EngineeringTask={
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
    reasoning:current.reasoning?{
      ...current.reasoning,
      routingDecision:undefined,
      records:[]
    }:undefined,
    status:"PROPOSED",
    blockedReason:undefined,
    updatedAt
  };
  if(current.status==="READY"||current.status==="RUNNING"||current.status==="COMPLETED"||current.status==="VERIFIED")
    throw new Error("Task is no longer mutable by an agent after readiness or execution begins.");
  const next=structuredClone(graph);
  next.revision++;
  next.tasks[index]=nextTask;
  const validation=validateEngineeringTaskGraph(next);
  if(validation.length) throw new Error("Updated task failed graph validation: "+validation.join(" "));
  return next;
}

function executionResultFromCapability(output:unknown):TaskGraphExecutionResult|undefined{
  if(!output||typeof output!=="object") return undefined;
  const value=output as Partial<TaskGraphExecutionResult>;
  if(typeof value.taskId!=="string"||!value.graph||typeof value.graph!=="object") return undefined;
  return value as TaskGraphExecutionResult;
}

export async function runBoundedAutonomy(
  request:BoundedAutonomyRequest,
  router:CapabilityRouter
):Promise<BoundedAutonomyReport>{
  const graphErrors=validateEngineeringTaskGraph(request.taskGraph);
  const limitErrors=validateLimits(request.limits);
  const initial={
    runId:request.runId,
    projectId:request.taskGraph.projectId,
    initialGraphRevision:request.taskGraph.revision,
    finalGraph:structuredClone(request.taskGraph),
    status:"INCOMPLETE" as const,
    steps:0,
    taskExecutions:0,
    delegations:0,
    actions:[] as BoundedAutonomyActionResult[],
    evidenceIds:[] as string[],
    artifactIds:[] as string[]
  };
  if(graphErrors.length||limitErrors.length)
    return {...initial,status:"FAILED",stopReason:[...graphErrors,...limitErrors].join(" ")};

  if(request.actions.length===0)
    return {...initial,status:"INCOMPLETE",stopReason:"Bounded agent action list must contain at least one action."};

  if(request.project&&request.project.id!==request.taskGraph.projectId)
    return {...initial,status:"FAILED",stopReason:"Agent project id does not match task graph project id."};

  let graph=structuredClone(request.taskGraph);
  let taskExecutions=0;
  let delegations=0;
  const actions:BoundedAutonomyActionResult[]=[];
  const evidenceIds:string[]=[];
  const artifactIds:string[]=[];
  const hostTimestamp=request.now??new Date().toISOString();
  if(Number.isNaN(Date.parse(hostTimestamp)))
    return {...initial,status:"FAILED",stopReason:"Host execution timestamp is invalid."};

  for(let index=0;index<request.actions.length;index++){
    if(index>=request.limits.maxSteps){
      return {
        ...initial,finalGraph:graph,status:"STOPPED",steps:actions.length,
        taskExecutions,delegations,actions,evidenceIds,artifactIds,
        stopReason:"Bounded agent step budget exhausted."
      };
    }

    const action=request.actions[index];
    const shapeErrors=validateActionShape(graph,action,request.limits,router,request.createTaskId);
    if(shapeErrors.length){
      const blocked={index,action,status:"BLOCKED" as const,reason:shapeErrors.join(" ")};
      actions.push(blocked);
      if(request.limits.stopOnFailure)
        return {
          ...initial,finalGraph:graph,status:"FAILED",steps:actions.length,
          taskExecutions,delegations,actions,evidenceIds,artifactIds,
          stopReason:"Bounded agent action rejected by core policy: "+shapeErrors.join(" ")
        };
      continue;
    }

    if(action.kind==="STOP"){
      actions.push({index,action,status:"STOPPED",reason:action.reason});
      return {
        ...initial,finalGraph:graph,status:"STOPPED",steps:actions.length,
        taskExecutions,delegations,actions,evidenceIds,artifactIds,
        stopReason:action.reason
      };
    }

    if(action.kind==="CREATE_TASK"){
      try{
        const created=applyCreateTask(graph,action,{...request,now:hostTimestamp},router);
        graph=created.graph;
        actions.push({index,action,status:"SUCCESS",taskId:created.task.id,reason:"Task created in PROPOSED state by the backend; readiness and approval remain separate."});
      }catch(error){
        const reason=error instanceof Error?error.message:"Task creation failed.";
        actions.push({index,action,status:"FAILED",reason});
        if(request.limits.stopOnFailure)
          return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:reason};
      }
      continue;
    }

    if(action.kind==="UPDATE_TASK"){
      try{
        graph=applyUpdateTask(graph,action,{...request,now:hostTimestamp},router);
        actions.push({index,action,status:"SUCCESS",taskId:action.taskId,reason:"Task updated; previous reasoning and approval grants were invalidated."});
      }catch(error){
        const reason=error instanceof Error?error.message:"Task update failed.";
        actions.push({index,action,status:"FAILED",taskId:action.taskId,reason});
        if(request.limits.stopOnFailure)
          return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:reason};
      }
      continue;
    }

    if(action.kind==="REQUEST_READY"){
      const readiness=evaluateTaskReady(graph,action.taskId,request.project);
      if(!readiness.ready){
        const waitingApproval=readiness.reasons.some(reason=>reason.toLowerCase().includes("approval"));
        const reason=readiness.reasons.join(" ");
        actions.push({index,action,status:waitingApproval?"WAITING_APPROVAL":"BLOCKED",taskId:action.taskId,reason});
        if(waitingApproval){
          return {...initial,finalGraph:graph,status:"WAITING_APPROVAL",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:reason};
        }
        if(request.limits.stopOnFailure)
          return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:reason};
        continue;
      }
      try{
        graph=transitionTask(graph,action.taskId,"READY",hostTimestamp);
        actions.push({index,action,status:"SUCCESS",taskId:action.taskId,reason:"Backend task-readiness gates passed; task transitioned to READY."});
      }catch(error){
        const reason=error instanceof Error?error.message:"Task readiness transition failed.";
        actions.push({index,action,status:"BLOCKED",taskId:action.taskId,reason});
        if(request.limits.stopOnFailure)
          return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:reason};
      }
      continue;
    }

    if(action.kind==="REQUEST_APPROVAL"){
      const task=graph.tasks.find(item=>item.id===action.taskId)!;
      if(!["PROPOSED","BLOCKED","FAILED"].includes(task.status)){
        const reason="Human approval can only be requested before task readiness or execution.";
        actions.push({index,action,status:"BLOCKED",taskId:task.id,reason});
        if(request.limits.stopOnFailure)
          return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:reason};
        continue;
      }
      const next=structuredClone(graph);
      next.revision++;
      const taskIndex=next.tasks.findIndex(item=>item.id===task.id);
      next.tasks[taskIndex]={...next.tasks[taskIndex],approvalRequired:true,approvalGranted:undefined,updatedAt:hostTimestamp};
      graph=next;
      actions.push({
        index,action,status:"WAITING_APPROVAL",taskId:task.id,
        reason:"Human approval was requested. The backend has added an approval gate; no approval was granted and no work was executed."
      });
      return {
        ...initial,finalGraph:graph,status:"WAITING_APPROVAL",steps:actions.length,
        taskExecutions,delegations,actions,evidenceIds,artifactIds,
        stopReason:action.reason
      };
    }

    if(action.kind==="DELEGATE_SPECIALIST"){
      if(delegations>=request.limits.maxDelegations){
        const blocked={index,action,status:"BLOCKED" as const,reason:"Bounded agent delegation budget exhausted."};
        actions.push(blocked);
        if(request.limits.stopOnFailure)
          return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:blocked.reason};
        continue;
      }
      const result=await router.execute({
        capability:"AGENT.DELEGATE_SPECIALIST",
        risk:"HIGH",
        input:{taskGraph:graph,taskId:action.taskId,specialistId:action.specialistId,stage:action.stage}
      });
      if(!result.success){
        const failed={index,action,status:"FAILED" as const,capability:"AGENT.DELEGATE_SPECIALIST",reason:result.error??"Specialist delegation failed."};
        actions.push(failed);
        if(request.limits.stopOnFailure)
          return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:failed.reason};
        continue;
      }
      delegations++;
      actions.push({index,action,status:"SUCCESS",capability:"AGENT.DELEGATE_SPECIALIST",taskId:action.taskId,output:result.output,reason:"Specialist delegation accepted by the core."});
      continue;
    }

    if(taskExecutions>=request.limits.maxTaskExecutions){
      const blocked={index,action,status:"BLOCKED" as const,reason:"Bounded agent task-execution budget exhausted."};
      actions.push(blocked);
      if(request.limits.stopOnFailure)
        return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:blocked.reason};
      continue;
    }

    const result=await router.execute({
      capability:"TASK_GRAPH.EXECUTE_READY",
      risk:"HIGH",
      input:{taskGraph:graph,taskId:action.taskId,stage:action.stage,project:request.project}
    });
    const execution=executionResultFromCapability(result.output);
    if(execution) graph=execution.graph;

    if(!result.success){
      const failed={index,action,status:"FAILED" as const,capability:"TASK_GRAPH.EXECUTE_READY",output:result.output,reason:result.error??"Bounded task execution failed."};
      actions.push(failed);
      if(request.limits.stopOnFailure)
        return {...initial,finalGraph:graph,status:"FAILED",steps:actions.length,taskExecutions,delegations,actions,evidenceIds,artifactIds,stopReason:failed.reason};
      continue;
    }

    taskExecutions++;
    evidenceIds.push(...(result.evidenceIds??[]));
    artifactIds.push(...(result.artifactIds??[]));
    actions.push({index,action,status:"SUCCESS",capability:"TASK_GRAPH.EXECUTE_READY",taskId:action.taskId,output:result.output,reason:"READY task executed through the existing deterministic workflow boundary."});
  }

  return {
    ...initial,
    finalGraph:graph,
    status:"COMPLETED",
    steps:actions.length,
    taskExecutions,
    delegations,
    actions,
    evidenceIds:[...new Set(evidenceIds)],
    artifactIds:[...new Set(artifactIds)]
  };
}
