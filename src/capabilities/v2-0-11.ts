import {CapabilityDefinition} from "../core/types.js";

export const V2_0_11_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"ENGINEERING.ASSESS_EXPERIENCE",
    domain:"orchestration",
    purpose:"Select the minimum engineering interaction rigor from intent, consequence, ambiguity and risk without requiring the engineer to choose a mode",
    inputs:["intent","risk","consequence","ambiguity","missingInputs","authorizationRequired","requestedExperience"],
    outputs:["experience_decision"],
    risk:"LOW",
    providers:["experience.risk-adaptive"],
    status:"PILOT"
  }
];
