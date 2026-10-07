import {CapabilityDefinition} from "../core/types.js";

export const V2_0_5_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"AGENT.RUN_BOUNDED",
    domain:"orchestration",
    purpose:"Execute an explicit sequence of agent-proposed engineering actions under hard step, risk, delegation, and task-execution limits",
    inputs:["runId","taskGraph","actions","limits","project"],
    outputs:["bounded_execution_report"],
    risk:"HIGH",
    providers:["bounded-agent"],
    status:"PILOT"
  }
];
