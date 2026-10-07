import {CapabilityDefinition} from "../core/types.js";

export const V2_0_4_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"AGENT.DELEGATE_SPECIALIST",
    domain:"orchestration",
    purpose:"Delegate exactly one READY engineering task to an explicitly named specialist without executing the task",
    inputs:["taskGraph","taskId","specialistId","stage"],
    outputs:["delegation"],
    risk:"HIGH",
    providers:["specialist-delegation"],
    status:"PILOT"
  }
];
