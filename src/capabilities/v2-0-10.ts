import {CapabilityDefinition} from "../core/types.js";

export const V2_0_10_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"ENGINEERING.COMPLETE_SHAFT",
    domain:"orchestration",
    purpose:"Complete a bounded shaft-design engineering workflow from explicit requirements through deterministic analysis, validation, evidence, and explicit human approval",
    inputs:["projectId","powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa","proposedDiameterMm","approval"],
    outputs:["engineering_completion_report"],
    risk:"HIGH",
    providers:["engineering-completion"],
    status:"PILOT"
  }
];
