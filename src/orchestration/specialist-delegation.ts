import {EngineeringWorkflowStage} from "./types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import {CapabilityDefinition,CapabilityRisk} from "../core/types.js";
import {EngineeringSpecialistProfile,riskWithinSpecialistCeiling} from "../agents/specialists.js";
import {validateEngineeringTaskGraph} from "../task-graph/validation.js";

export interface SpecialistDelegationRequest{
  taskGraph:EngineeringTaskGraph;
  taskId:string;
  specialistId:string;
  stage:EngineeringWorkflowStage;
}

export interface EngineeringSpecialistDelegation{
  id:string;
  projectId:string;
  graphId:string;
  graphRevision:number;
  taskId:string;
  taskName:string;
  capability:string;
  capabilityDomain:CapabilityDefinition["domain"];
  risk:CapabilityRisk;
  specialistId:string;
  specialistName:string;
  stage:EngineeringWorkflowStage;
  status:"DELEGATED";
  executionCapability:"TASK_GRAPH.EXECUTE_READY";
  createdAt:string;
  reason:string;
}

const validWorkflowStages:readonly EngineeringWorkflowStage[]=["REQUIREMENTS","RESEARCH","COMPUTATION","ANALYSIS","CAD","SIMULATION","DYNAMICS","ROBOTICS","MANUFACTURING","VALIDATION","PLM"];

export function validateSpecialistDelegationRequest(
  request:SpecialistDelegationRequest,
  specialist:EngineeringSpecialistProfile|undefined,
  definition:CapabilityDefinition|undefined
):string[]{
  const errors:string[]=[];
  errors.push(...validateEngineeringTaskGraph(request.taskGraph));

  if(!request.taskId.trim()) errors.push("Delegation taskId is required.");
  if(!request.specialistId.trim()) errors.push("Delegation specialistId is required.");
  if(!validWorkflowStages.includes(request.stage)) errors.push("Delegation stage is invalid: "+String(request.stage)+".");

  const task=request.taskGraph.tasks.find(item=>item.id===request.taskId);
  if(!task){
    errors.push("Engineering task not found: "+request.taskId+".");
    return [...new Set(errors)];
  }

  if(task.status!=="READY")
    errors.push("Specialist delegation requires a READY task; current status is "+task.status+".");
  if(!task.capability?.trim())
    errors.push("Engineering capability is required before delegation: "+task.id+".");

  if(!specialist)
    errors.push("Engineering specialist not found: "+request.specialistId+".");

  if(!definition){
    if(task.capability) errors.push("Capability definition not found: "+task.capability+".");
  }else{
    if(!specialist?.domains.includes(definition.domain))
      errors.push("Specialist "+(specialist?.id??request.specialistId)+" is not authorized for capability domain "+definition.domain+".");
    if(specialist?.capabilities&&specialist.capabilities.length>0&&!specialist.capabilities.includes(definition.id))
      errors.push("Specialist "+specialist.id+" is not authorized for capability "+definition.id+".");
    if(task&&specialist&&!riskWithinSpecialistCeiling(task.risk,specialist))
      errors.push("Task risk "+task.risk+" exceeds specialist "+specialist.id+" risk ceiling "+specialist.maxRisk+".");
    if(specialist&&!riskWithinSpecialistCeiling(definition.risk,specialist))
      errors.push("Capability risk "+definition.risk+" exceeds specialist "+specialist.id+" risk ceiling "+specialist.maxRisk+".");
  }

  return [...new Set(errors)];
}

export function createSpecialistDelegation(
  request:SpecialistDelegationRequest,
  specialist:EngineeringSpecialistProfile,
  definition:CapabilityDefinition,
  createdAt=new Date().toISOString()
):EngineeringSpecialistDelegation{
  const task=request.taskGraph.tasks.find(item=>item.id===request.taskId);
  if(!task) throw new Error("Engineering task not found: "+request.taskId+".");
  const errors=validateSpecialistDelegationRequest(request,specialist,definition);
  if(errors.length) throw new Error(errors.join(" "));
  return {
    id:"delegation:"+request.taskGraph.projectId+":"+task.id+":"+specialist.id+":r"+request.taskGraph.revision,
    projectId:request.taskGraph.projectId,
    graphId:request.taskGraph.id,
    graphRevision:request.taskGraph.revision,
    taskId:task.id,
    taskName:task.name,
    capability:definition.id,
    capabilityDomain:definition.domain,
    risk:task.risk,
    specialistId:specialist.id,
    specialistName:specialist.name,
    stage:request.stage,
    status:"DELEGATED",
    executionCapability:"TASK_GRAPH.EXECUTE_READY",
    createdAt,
    reason:"READY task "+task.id+" is explicitly delegated to "+specialist.name+"; execution remains a separate gated capability."
  };
}
