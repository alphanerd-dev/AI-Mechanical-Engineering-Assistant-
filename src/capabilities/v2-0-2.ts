import {CapabilityDefinition} from "../core/types.js";

export const V2_0_2_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"TASK_GRAPH.EXECUTE_READY",
    domain:"orchestration",
    purpose:"Execute exactly one READY engineering task through the existing dependency-aware workflow engine",
    inputs:["taskGraph","taskId","stage","project"],
    outputs:["task_execution"],
    risk:"HIGH",
    providers:["task-graph.execution"],
    status:"PILOT"
  }
];
