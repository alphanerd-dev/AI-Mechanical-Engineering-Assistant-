import {
  AgentActionProposal,
  AgentApprovalProposal,
  AgentDelegationProposal,
  AgentPlanRequest,
  AgentResumeRequest,
  AgentRuntime,
  AgentRuntimeObservation
} from "./runtime.js";

export interface LangGraphBridge{
  plan(request:AgentPlanRequest):Promise<readonly AgentActionProposal[]>;
  delegate(request:AgentDelegationProposal):Promise<AgentActionProposal>;
  requestApproval(request:AgentApprovalProposal):Promise<AgentActionProposal>;
  resume(request:AgentResumeRequest):Promise<readonly AgentActionProposal[]>;
  observe(runId:string):Promise<AgentRuntimeObservation>;
  stop(runId:string,reason:string):Promise<AgentRuntimeObservation>;
}

export class LangGraphAgentRuntimeAdapter implements AgentRuntime{
  constructor(private readonly bridge:LangGraphBridge){}

  plan(request:AgentPlanRequest):Promise<readonly AgentActionProposal[]>{
    return this.bridge.plan(request);
  }

  delegate(request:AgentDelegationProposal):Promise<AgentActionProposal>{
    return this.bridge.delegate(request);
  }

  requestApproval(request:AgentApprovalProposal):Promise<AgentActionProposal>{
    return this.bridge.requestApproval(request);
  }

  resume(request:AgentResumeRequest):Promise<readonly AgentActionProposal[]>{
    return this.bridge.resume(request);
  }

  observe(runId:string):Promise<AgentRuntimeObservation>{
    return this.bridge.observe(runId);
  }

  stop(runId:string,reason:string):Promise<AgentRuntimeObservation>{
    return this.bridge.stop(runId,reason);
  }
}
