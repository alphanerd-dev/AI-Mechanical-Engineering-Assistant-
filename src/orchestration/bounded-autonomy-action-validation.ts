import {CapabilityRisk} from "../core/types.js";
import {EngineeringTask,EngineeringTaskGraph} from "../task-graph/types.js";
import {CapabilityRouter} from "../capabilities/router.js";
import type {AgentActionProposal,AgentRunLimits} from "../agents/runtime.js";
import {BOUNDED_AUTONOMY_HARD_LIMITS} from "./bounded-autonomy-policy.js";
import {capabilityErrors,isJsonValue,isPlainRecord,taskRiskRank} from "./bounded-autonomy-validation.js";

export function taskForAction(graph:EngineeringTaskGraph,action:AgentActionProposal):EngineeringTask|undefined{
  if(action.kind==="STOP"||action.kind==="CREATE_TASK") return undefined;
  return graph.tasks.find(task=>task.id===action.taskId);
}

function validateDependencyReferences(
  graph:EngineeringTaskGraph,
  dependencies:unknown
):string[]{
  if(dependencies===undefined) return [];
  if(!Array.isArray(dependencies)) return ["New task dependencies must be an array."];
  const errors:string[]=[];
  for(const dependency of dependencies){
    if(typeof dependency!=="string"||!dependency.trim())
      errors.push("New task dependencies must be non-empty ids.");
    else if(!graph.tasks.some(task=>task.id===dependency))
      errors.push("New task dependency does not exist: "+dependency+".");
  }
  return errors;
}

function validateRequirementReferences(requirementIds:unknown):string[]{
  if(requirementIds===undefined) return [];
  if(!Array.isArray(requirementIds)) return ["New task requirement ids must be an array."];
  const errors:string[]=[];
  for(const requirementId of requirementIds){
    if(typeof requirementId!=="string"||!requirementId.trim())
      errors.push("New task requirement ids cannot be empty.");
    else if(!/^[A-Za-z0-9._:-]{1,160}$/.test(requirementId))
      errors.push("New task requirement id has an invalid format.");
  }
  return errors;
}

function validateCreateDependencies(
  graph:EngineeringTaskGraph,
  action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>
):string[]{
  return [
    ...validateDependencyReferences(graph,action.dependsOn),
    ...validateRequirementReferences(action.requiredRequirementIds)
  ];
}

function isValidTaskText(value:unknown,maxLength:number):boolean{
  if(typeof value!=="string") return false;
  if(!value.trim()) return false;
  return value.length<=maxLength;
}

interface CreateTaskValidationContext {
  graph:EngineeringTaskGraph;
  action:Extract<AgentActionProposal,{kind:"CREATE_TASK"}>;
  limits:AgentRunLimits;
  router:CapabilityRouter;
  createTaskId?:()=>string;
}

export function validateCreateTaskAction(context:CreateTaskValidationContext):string[]{
  const {graph,action,limits,router,createTaskId}=context;
  const errors:string[]=[];
  if(limits.allowTaskCreation!==true) errors.push("Task creation is not enabled by the host policy.");
  if(!createTaskId) errors.push("A host-owned task id factory is required for task creation.");
  if(graph.tasks.length>=BOUNDED_AUTONOMY_HARD_LIMITS.maxTaskGraphSize)
    errors.push("Engineering task graph reached its hard size limit.");
  if(!isValidTaskText(action.name,160)) errors.push("New task name must contain 1-160 characters.");
  if(!isValidTaskText(action.goal,2_000)) errors.push("New task goal must contain 1-2000 characters.");
  errors.push(...capabilityErrors({capability:action.capability,risk:action.risk,input:action.input,limits,router,requireAllInputs:false}).errors);
  errors.push(...validateCreateDependencies(graph,action));
  return [...new Set(errors)];
}

function validatePatchKeys(
  patch:Record<string,unknown>,
  allowedKeys:readonly string[]
):string[]{
  const extra=Object.keys(patch).filter(key=>!allowedKeys.includes(key));
  const errors=extra.length
    ?["Task update patch contains unsupported fields: "+extra.join(", ")+"."]:[];
  if(Object.keys(patch).length===0)
    errors.push("Task update patch must change at least one permitted field.");
  return errors;
}

function isInvalidOptionalText(value:unknown,maxLength?:number):boolean{
  if(value===undefined) return false;
  if(typeof value!=="string") return true;
  if(!value.trim()) return true;
  if(maxLength!==undefined){
    if(value.length>maxLength) return true;
  }
  return false;
}

function validatePatchTextFields(patch:Record<string,unknown>):string[]{
  const errors:string[]=[];
  if(isInvalidOptionalText(patch.name,160))
    errors.push("Updated task name must contain 1-160 characters.");
  if(isInvalidOptionalText(patch.goal,2_000))
    errors.push("Updated task goal must contain 1-2000 characters.");
  if(isInvalidOptionalText(patch.capability))
    errors.push("Updated task capability must be a non-empty registered capability id.");
  return errors;
}

function validatePatchInput(patch:Record<string,unknown>):string[]{
  return patch.input===undefined||
    (isPlainRecord(patch.input)&&isJsonValue(patch.input))
    ?[]
    :["Updated task input must be a plain, finite JSON object."];
}

function validatePatchGates(patch:Record<string,unknown>,task:EngineeringTask):string[]{
  return [
    ...validateUpdateRisk(patch.risk,task.risk),
    ...validateUpdatedStringList(patch.dependsOn,task.dependsOn??[],"dependencies"),
    ...validateUpdatedStringList(patch.requiredRequirementIds,task.requiredRequirementIds??[],"requirement gates")
  ];
}

function validateUpdatePatchShape(patch:unknown,task:EngineeringTask):string[]{
  if(!isPlainRecord(patch)) return ["Task update patch must be a plain object."];
  return [
    ...validatePatchKeys(patch,["name","goal","capability","risk","input","dependsOn","requiredRequirementIds"]),
    ...validatePatchTextFields(patch),
    ...validatePatchInput(patch),
    ...validatePatchGates(patch,task)
  ];
}

function validateUpdateRisk(value:unknown,currentRisk:CapabilityRisk):string[]{
  if(value===undefined) return [];
  if(typeof value!=="string"||!(value in taskRiskRank)) return ["Updated task risk is invalid."];
  return taskRiskRank[value as CapabilityRisk]<taskRiskRank[currentRisk]
    ?["Agent task updates cannot lower an existing task risk."]:[];
}

function isNonEmptyStringArray(value:unknown):value is string[]{
  if(!Array.isArray(value)) return false;
  return value.every(item=>typeof item==="string"&&item.trim().length>0);
}

function removesExistingValues(current:readonly string[],next:readonly string[]):boolean{
  return current.some(value=>!next.includes(value));
}

function validateUpdatedStringList(value:unknown,current:readonly string[],label:string):string[]{
  if(value===undefined) return [];
  if(!isNonEmptyStringArray(value))
    return ["Updated "+label+" must be an array of non-empty strings."];
  if(removesExistingValues(current,value))
    return ["Agent task updates cannot remove existing "+label+"."];
  return [];
}

interface UpdatedCapabilityContext{
  task:EngineeringTask;
  patch:Record<string,unknown>;
  limits:AgentRunLimits;
  router:CapabilityRouter;
}

function resolveUpdatedCapability(task:EngineeringTask,patch:Record<string,unknown>):{
  capability:string;
  risk:CapabilityRisk;
  input:Record<string,unknown>;
}{
  return {
    capability:typeof patch.capability==="string"?patch.capability:task.capability??"",
    risk:(typeof patch.risk==="string"?patch.risk:task.risk) as CapabilityRisk,
    input:isPlainRecord(patch.input)?patch.input:task.input
  };
}

function assignedSkillErrors(task:EngineeringTask,capability:string,risk:CapabilityRisk):string[]{
  const skill=task.reasoning?.skillManifest;
  if(!skill) return [];
  const errors:string[]=[];
  if(!skill.allowedCapabilities.includes(capability))
    errors.push("Updated task capability is outside its assigned skill allowlist.");
  if(taskRiskRank[risk]>taskRiskRank[skill.maximumRisk])
    errors.push("Updated task risk exceeds its assigned skill maximum.");
  return errors;
}

function validateUpdatedCapability(context:UpdatedCapabilityContext):string[]{
  const {task,limits,router}=context;
  const resolved=resolveUpdatedCapability(task,context.patch);
  if(!resolved.capability.trim()) return ["An updated task must retain a registered capability."];
  return [
    ...capabilityErrors({...resolved,limits,router,requireAllInputs:false}).errors,
    ...assignedSkillErrors(task,resolved.capability,resolved.risk)
  ];
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
  errors.push(...validateUpdatedCapability({task,patch:action.patch,limits,router}));
  return [...new Set(errors)];
}

function validateReadinessAction(task:EngineeringTask|undefined,limits:AgentRunLimits,router:CapabilityRouter):string[]{
  if(!task) return [];
  const errors:string[]=[];
  if(!["PROPOSED","FAILED","BLOCKED"].includes(task.status))
    errors.push("Only a PROPOSED, FAILED or BLOCKED task can request readiness.");
  if(task.capability) errors.push(...capabilityErrors({capability:task.capability,risk:task.risk,input:task.input,limits,router,requireAllInputs:true}).errors);
  return errors;
}

function validateExecutionAction(
  task:EngineeringTask|undefined,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  if(!task) return [];
  const errors=task.capability
    ?capabilityErrors({capability:task.capability,risk:task.risk,input:task.input,limits,router,requireAllInputs:true}).errors
    :["Task has no registered capability to execute."];
  if(task.status!=="READY") errors.push("Task must be READY before bounded execution; current status is "+task.status+".");
  return errors;
}

function specialistAllowlistErrors(specialistId:string,limits:AgentRunLimits):string[]{
  const allowed=limits.allowedSpecialists?.includes(specialistId)===true;
  if(limits.requireSpecialistAllowlist===true){
    return allowed?[]:["Specialist is outside the required host allowlist: "+specialistId+"."];
  }
  if(!limits.allowedSpecialists?.length) return [];
  return allowed?[]:["Specialist is outside the bounded agent policy: "+specialistId+"."];
}

function taskDelegationErrors(
  task:EngineeringTask|undefined,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  if(!task) return [];
  const errors=task.capability
    ?capabilityErrors({capability:task.capability,risk:task.risk,input:task.input,limits,router,requireAllInputs:true}).errors
    :["Task has no registered capability for specialist delegation."];
  if(task.status!=="READY")
    errors.push("Task must be READY before specialist delegation; current status is "+task.status+".");
  return errors;
}

function validateDelegationAction(
  action:Extract<AgentActionProposal,{kind:"DELEGATE_SPECIALIST"}>,
  task:EngineeringTask|undefined,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  return [
    ...specialistAllowlistErrors(action.specialistId,limits),
    ...taskDelegationErrors(task,limits,router)
  ];
}

export function validateTaskAction(
  action:Exclude<AgentActionProposal,{kind:"CREATE_TASK"|"STOP"}>,
  task:EngineeringTask|undefined,
  limits:AgentRunLimits,
  router:CapabilityRouter
):string[]{
  switch(action.kind){
    case "UPDATE_TASK": return validateUpdateTaskAction(action,task,limits,router);
    case "REQUEST_READY": return validateReadinessAction(task,limits,router);
    case "EXECUTE_TASK": return validateExecutionAction(task,limits,router);
    case "DELEGATE_SPECIALIST": return validateDelegationAction(action,task,limits,router);
    case "REQUEST_APPROVAL":
      return typeof action.reason==="string"&&action.reason.trim()
        ?[]
        :["Agent approval request reason is required."];
  }
}

function isStaleActionRevision(graph:EngineeringTaskGraph,action:Exclude<AgentActionProposal,{kind:"CREATE_TASK"|"STOP"}>):boolean{
  if(action.expectedGraphRevision===undefined) return false;
  return action.expectedGraphRevision!==graph.revision;
}

function validateActionTarget(
  graph:EngineeringTaskGraph,
  action:Exclude<AgentActionProposal,{kind:"CREATE_TASK"|"STOP"}>
):{task:EngineeringTask|undefined;errors:string[]}{
  const task=taskForAction(graph,action);
  const errors:string[]=[];
  if(!task) errors.push("Agent action references an unknown task: "+action.taskId+".");
  if(task){
    if(isStaleActionRevision(graph,action))
      errors.push("Agent action graph revision is stale: expected "+action.expectedGraphRevision+", current "+graph.revision+".");
  }
  return {task,errors};
}

interface ActionShapeContext {
  graph:EngineeringTaskGraph;
  limits:AgentRunLimits;
  router:CapabilityRouter;
  createTaskId?:()=>string;
}

export function validateActionShape(
  action:AgentActionProposal,
  context:ActionShapeContext
):string[]{
  const {graph,limits,router,createTaskId}=context;
  if(action.kind==="CREATE_TASK") return validateCreateTaskAction({graph,action,limits,router,createTaskId});
  if(action.kind==="STOP") return [];
  const target=validateActionTarget(graph,action);
  return [...new Set([
    ...target.errors,
    ...validateTaskAction(action,target.task,limits,router)
  ])];
}

