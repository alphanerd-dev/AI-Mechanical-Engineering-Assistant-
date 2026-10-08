import {CapabilityDefinition} from "../core/types.js";

export const V2_0_14_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"ENGINEERING.ENTER_FROM_INTENT",
    domain:"orchestration",
    purpose:"Enter a supported engineering completion unit from natural-language engineering intent while preserving context, risk-adaptive rigor, deterministic execution, validation, evidence and approval boundaries",
    inputs:["rawIntent","projectId","context","approval"],
    outputs:["engineering_intent_entry_result"],
    risk:"HIGH",
    providers:["engineering.ai-intent"],
    status:"PILOT"
  }
];
