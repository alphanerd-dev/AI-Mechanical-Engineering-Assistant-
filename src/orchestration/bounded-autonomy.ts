import {CapabilityRouter} from "../capabilities/router.js";
import {CapabilityRisk,ProjectState} from "../core/types.js";
import {EngineeringWorkflowStage} from "./types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import {validateEngineeringTaskGraph} from "../task-graph/validation.js";
import {TaskGraphExecutionResult} from "./task-graph-adapter.js";
import {AgentActionProposal,AgentRunLimits} from "../agents/runtime.js";

export const BOUNDED_AUTONOMY_HARD_LIMITS={
  maxSteps:25,
  maxTaskExecutions:10,
  maxDelegations:10,
  maxRisk:"HIGH" as CapabilityRisk
} as const;

const riskRank:Record<CapabilityRisk,number>={LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4};
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
}

export type BoundedAutonomyActionStatus="SUCCESS"|"FAILED"|"BLOCKED"|"WAITING_APPROVAL"|"STOPPED";

export interface BoundedAutonomyActionResult{
  index:number;
  action:AgentActionProposal;
  status:BoundedAutonomyActionStatus;
  capability?:string;
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
  return [...new Set(errors)];
}

function taskForAction(graph:EngineeringTaskGraph,action:AgentActionProposal){
  if(action.kind==="STOP") return undefined;
  return graph.tasks.find(task=>task.id===action.taskId);
}

function validateActionShape(
  graph:EngineeringTaskGraph,
  action:AgentActionProposal,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  const errors:string[]=[];
  if(action.kind!=="STOP"&&!validStages.includes(action.stage??""))
    errors.push("Agent action stage is invalid.");

  const task=taskForAction(graph,action);
  if(action.kind!=="STOP"&&!task)
    errors.push("Agent action references an unknown task: "+action.taskId+".");

  if(action.kind!=="STOP"&&task&&action.expectedGraphRevision!==undefined&&action.expectedGraphRevision!==graph.revision)
    errors.push(`Agent action graph revision is stale: expected ${action.expectedGraphRevision}, current ${graph.revision}.`);

  if(action.kind==="REQUEST_APPROVAL"&&!action.reason.trim())
    errors.push("Agent approval request reason is required.");

  if(action.kind==="DELEGATE_SPECIALIST"){
    if(limits.allowedSpecialists&&limits.allowedSpecialists.length>0&&!limits.allowedSpecialists.includes(action.specialistId))
      errors.push("Specialist is outside the bounded agent policy: "+action.specialistId+".");
    if(task?.capability){
      const definition=router.getDefinition(task.capability);
      if(!definition) errors.push("Capability definition not found: "+task.capability+".");
      else if(!withinRiskLimit(task.risk,limits.maxRisk)||!withinRiskLimit(definition.risk,limits.maxRisk))
        errors.push("Delegated task or capability risk exceeds the bounded agent policy.");
      else if(limits.allowedCapabilities&&limits.allowedCapabilities.length>0&&!limits.allowedCapabilities.includes(definition.id))
        errors.push("Capability is outside the bounded agent policy: "+definition.id+".");
    }
  }

  if(action.kind==="EXECUTE_TASK"&&task?.capability){
    const definition=router.getDefinition(task.capability);
    if(!definition) errors.push("Capability definition not found: "+task.capability+".");
    else if(!withinRiskLimit(task.risk,limits.maxRisk)||!withinRiskLimit(definition.risk,limits.maxRisk))
      errors.push("Task or capability risk exceeds the bounded agent policy.");
    else if(limits.allowedCapabilities&&limits.allowedCapabilities.length>0&&!limits.allowedCapabilities.includes(definition.id))
      errors.push("Capability is outside the bounded agent policy: "+definition.id+".");
    if(task.status!=="READY")
      errors.push(`Task must be READY before bounded execution; current status is ${task.status}.`);
  }

  if(action.kind==="DELEGATE_SPECIALIST"&&task&&task.status!=="READY")
    errors.push(`Task must be READY before specialist delegation; current status is ${task.status}.`);

  return [...new Set(errors)];
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
    return {...initial,stopReason:[...graphErrors,...limitErrors].join(" ")};

  if(request.project&&request.project.id!==request.taskGraph.projectId)
    return {...initial,stopReason:"Agent project id does not match task graph project id."};

  let graph=structuredClone(request.taskGraph);
  let taskExecutions=0;
  let delegations=0;
  const actions:BoundedAutonomyActionResult[]=[];
  const evidenceIds:string[]=[];
  const artifactIds:string[]=[];

  for(let index=0;index<request.actions.length;index++){
    if(index>=request.limits.maxSteps){
      return {
        ...initial,finalGraph:graph,status:"STOPPED",steps:actions.length,
        taskExecutions,delegations,actions,evidenceIds,artifactIds,
        stopReason:"Bounded agent step budget exhausted."
      };
    }

    const action=request.actions[index];
    const shapeErrors=validateActionShape(graph,action,request.limits,router);
    if(shapeErrors.length){
      const blocked={index,action,status:"BLOCKED" as const,reason:shapeErrors.join(" ")};
      actions.push(blocked);
      if(request.limits.stopOnFailure)
        return {
          ...initial,finalGraph:graph,status:"FAILED",steps:actions.length,
          taskExecutions,delegations,actions,evidenceIds,artifactIds,
          stopReason:"Bounded agent action rejected by core policy."
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

    if(action.kind==="REQUEST_APPROVAL"){
      actions.push({
        index,action,status:"WAITING_APPROVAL",
        reason:"Human approval requested; bounded execution is paused before any gated work."
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
      actions.push({index,action,status:"SUCCESS",capability:"AGENT.DELEGATE_SPECIALIST",output:result.output,reason:"Specialist delegation accepted by the core."});
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
    actions.push({index,action,status:"SUCCESS",capability:"TASK_GRAPH.EXECUTE_READY",output:result.output,reason:"READY task executed through the existing deterministic workflow boundary."});
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
