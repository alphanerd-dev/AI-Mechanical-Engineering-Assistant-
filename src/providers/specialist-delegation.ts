import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityRegistry} from "../capabilities/registry.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {EngineeringWorkflowStage} from "../orchestration/types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import {createSpecialistDelegation,SpecialistDelegationRequest,validateSpecialistDelegationRequest} from "../orchestration/specialist-delegation.js";
import {getEngineeringSpecialist} from "../agents/specialists.js";

export class SpecialistDelegationProvider implements EngineeringProvider{
  readonly id="specialist-delegation";
  readonly capabilities=["AGENT.DELEGATE_SPECIALIST"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"orchestration",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"1.0"
  };

  constructor(private readonly registry:CapabilityRegistry){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="AGENT.DELEGATE_SPECIALIST")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported specialist delegation capability."};

    const input=request.input;
    const taskGraph=input.taskGraph as EngineeringTaskGraph|undefined;
    const taskId=typeof input.taskId==="string"?input.taskId:"";
    const specialistId=typeof input.specialistId==="string"?input.specialistId:"";
    const stage=input.stage as EngineeringWorkflowStage|undefined;

    if(!taskGraph) return {capability:request.capability,provider:this.id,success:false,error:"A task graph is required."};
    if(!stage) return {capability:request.capability,provider:this.id,success:false,error:"A workflow stage is required."};

    const task=taskGraph.tasks.find(item=>item.id===taskId);
    const specialist=getEngineeringSpecialist(specialistId);
    const definition=task?.capability?this.registry.getDefinition(task.capability):undefined;

    const delegationRequest:SpecialistDelegationRequest={taskGraph,taskId,specialistId,stage};
    const errors=validateSpecialistDelegationRequest(delegationRequest,specialist,definition);
    if(errors.length){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:errors.join(" ")
      };
    }

    const delegation=createSpecialistDelegation(
      delegationRequest,
      specialist!,
      definition!
    );

    return {
      capability:request.capability,
      provider:this.id,
      success:true,
      output:{delegation},
      evidenceIds:[]
    };
  }
}
