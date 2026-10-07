import {CapabilityDefinition} from "../core/types.js";

export const V2_0_12_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"ENGINEERING.RESOLVE_CONTEXT",
    domain:"orchestration",
    purpose:"Resolve known engineering context before asking for missing inputs",
    inputs:["missingInputs","context"],
    outputs:["context_decision"],
    risk:"LOW",
    providers:["experience.context"],
    status:"PILOT"
  }
];
