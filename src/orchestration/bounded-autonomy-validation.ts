import {CapabilityDefinition,CapabilityRisk} from "../core/types.js";
import {CapabilityRouter} from "../capabilities/router.js";
import type {AgentRunLimits} from "../agents/runtime.js";
import {BOUNDED_AUTONOMY_HARD_LIMITS} from "./bounded-autonomy-policy.js";

const riskRank:Record<CapabilityRisk,number>={LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4};
export const taskRiskRank:Record<CapabilityRisk,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};

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

function requiredAllowlistMissing(required:boolean,values:readonly string[]|undefined):boolean{
  if(!required) return false;
  if(!values) return true;
  return values.length===0;
}

function hasDuplicateValues(values:readonly string[]|undefined):boolean{
  if(!values) return false;
  return new Set(values).size!==values.length;
}

function validateAllowlistLimits(limits:AgentRunLimits):string[]{
  const errors:string[]=[];
  if(requiredAllowlistMissing(limits.requireCapabilityAllowlist===true,limits.allowedCapabilities))
    errors.push("A non-empty host capability allowlist is required for model-directed execution.");
  if(requiredAllowlistMissing(limits.requireSpecialistAllowlist===true,limits.allowedSpecialists))
    errors.push("A non-empty host specialist allowlist is required for model-directed delegation.");
  if(hasDuplicateValues(limits.allowedCapabilities))
    errors.push("Agent capability allowlist cannot contain duplicate ids.");
  if(hasDuplicateValues(limits.allowedSpecialists))
    errors.push("Agent specialist allowlist cannot contain duplicate ids.");
  return errors;
}

export function validateLimits(limits:AgentRunLimits):string[]{
  return [...new Set([
    ...validateCountLimits(limits),
    ...validateRiskLimit(limits),
    ...validateAllowlistLimits(limits)
  ])];
}

function hasPlainObjectPrototype(value:object):boolean{
  const prototype=Object.getPrototypeOf(value);
  if(prototype===Object.prototype) return true;
  return prototype===null;
}

function hasNoOwnSymbols(value:object):boolean{
  return Object.getOwnPropertySymbols(value).length===0;
}

export function isPlainRecord(value:unknown):value is Record<string,unknown>{
  if(value===null) return false;
  if(typeof value!=="object") return false;
  if(Array.isArray(value)) return false;
  return hasPlainObjectPrototype(value);
}

function isJsonPrimitive(value:unknown):boolean{
  if(value===null) return true;
  if(typeof value==="string") return true;
  if(typeof value==="boolean") return true;
  if(typeof value==="number") return Number.isFinite(value);
  return false;
}

function isJsonArrayValue(value:unknown[],seen:Set<object>):boolean{
  if(Object.keys(value).length!==value.length) return false;
  if(!hasNoOwnSymbols(value)) return false;
  return value.every(item=>isJsonValue(item,seen));
}

function isJsonObjectValue(value:Record<string,unknown>,seen:Set<object>):boolean{
  if(!hasPlainObjectPrototype(value)) return false;
  if(!hasNoOwnSymbols(value)) return false;
  return Object.values(value).every(item=>isJsonValue(item,seen));
}

export function isJsonValue(value:unknown,seen=new Set<object>()):boolean{
  if(isJsonPrimitive(value)) return true;
  if(typeof value!=="object") return false;
  if(value===null) return false;
  if(seen.has(value)) return false;
  seen.add(value);
  const valid=Array.isArray(value)
    ?isJsonArrayValue(value,seen)
    :isJsonObjectValue(value as Record<string,unknown>,seen);
  seen.delete(value);
  return valid;
}

function getPath(input:Record<string,unknown>,path:string):unknown{
  return path.split(".").reduce<unknown>((value,key)=>{
    if(value===null||value===undefined) return undefined;
    if(typeof value!=="object") return undefined;
    if(Array.isArray(value)) return undefined;
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

function appendInputPathErrors(
  child:unknown,
  path:string,
  descendants:readonly string[],
  allowedPaths:readonly string[],
  errors:string[]
):void{
  if(descendants.length===0) return;
  if(!isPlainRecord(child)){
    errors.push("Task input path must be an object to satisfy the registered nested contract: "+path+".");
    return;
  }
  errors.push(...inputPathErrors(child,allowedPaths,path));
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
    appendInputPathErrors(child,path,descendants,allowedPaths,errors);
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

function capabilityAvailabilityErrors(
  capability:string,
  definition:CapabilityDefinition,
  router:CapabilityRouter
):string[]{
  const errors:string[]=[];
  if(definition.status==="BLOCKED"||definition.status==="DEPRECATED")
    errors.push("Capability is blocked or deprecated: "+capability+".");
  if(!router.hasExecutableProvider(capability))
    errors.push("No executable provider is registered for capability: "+capability+".");
  return errors;
}

function capabilityRiskErrors(
  risk:CapabilityRisk,
  definition:CapabilityDefinition,
  limits:AgentRunLimits
):string[]{
  const errors:string[]=[];
  if(taskRiskRank[risk]<taskRiskRank[definition.risk])
    errors.push("Task risk cannot be lower than its registered capability risk: "+risk+" < "+definition.risk+".");
  if(!withinRiskLimit(risk,limits.maxRisk)||!withinRiskLimit(definition.risk,limits.maxRisk))
    errors.push("Task or capability risk exceeds the bounded agent policy.");
  return errors;
}

function isOutsideRequiredCapabilityAllowlist(capability:string,limits:AgentRunLimits):boolean{
  if(limits.requireCapabilityAllowlist!==true) return false;
  if(!limits.allowedCapabilities) return true;
  return !limits.allowedCapabilities.includes(capability);
}

function isOutsideConfiguredCapabilityAllowlist(capability:string,limits:AgentRunLimits):boolean{
  if(!limits.allowedCapabilities?.length) return false;
  return !limits.allowedCapabilities.includes(capability);
}

function capabilityAllowlistErrors(capability:string,limits:AgentRunLimits):string[]{
  if(isOutsideRequiredCapabilityAllowlist(capability,limits))
    return ["Capability is outside the required host allowlist: "+capability+"."];
  if(isOutsideConfiguredCapabilityAllowlist(capability,limits))
    return ["Capability is outside the bounded agent policy: "+capability+"."];
  return [];
}

interface CapabilityValidationRequest {
  capability:string;
  risk:CapabilityRisk;
  input:Record<string,unknown>;
  limits:AgentRunLimits;
  router:CapabilityRouter;
  requireAllInputs:boolean;
}

export function capabilityErrors(request:CapabilityValidationRequest):{definition?:CapabilityDefinition;errors:string[]}{
  const {capability,risk,input,limits,router,requireAllInputs}=request;
  if(isControlPlaneCapability(capability))
    return {errors:["Task capability cannot target an orchestration/control-plane operation: "+capability+"."]};
  const definition=router.getDefinition(capability);
  if(!definition) return {errors:["Registered capability definition not found: "+capability+"."]};
  const errors=[
    ...capabilityAvailabilityErrors(capability,definition,router),
    ...capabilityRiskErrors(risk,definition,limits),
    ...capabilityAllowlistErrors(capability,limits),
    ...capabilityInputErrors(definition,input,requireAllInputs)
  ];
  return {definition,errors:[...new Set(errors)]};
}

