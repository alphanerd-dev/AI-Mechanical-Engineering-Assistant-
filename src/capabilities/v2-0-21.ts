import {CapabilityDefinition} from "../core/types.js";

export const V2_0_21_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"ANALYSIS.DC_POWER",
    domain:"analysis",
    purpose:"Calculate steady-state DC electrical power from explicit voltage and current",
    inputs:["voltageV","currentA"],
    outputs:["powerW"],
    risk:"LOW",
    providers:["electrical-analysis"],
    status:"VERIFIED"
  },
  {
    id:"ANALYSIS.DC_RESISTANCE",
    domain:"analysis",
    purpose:"Calculate equivalent DC resistance from explicit voltage and non-zero current",
    inputs:["voltageV","currentA"],
    outputs:["resistanceOhm"],
    risk:"LOW",
    providers:["electrical-analysis"],
    status:"VERIFIED"
  },
  {
    id:"ENGINEERING.COMPLETE_DC_LOAD",
    domain:"orchestration",
    purpose:"Complete a bounded steady-state DC load engineering workflow from explicit requirements through deterministic analysis, validation, evidence and explicit approval",
    inputs:["projectId","voltageV","currentA","maximumPowerW","approval"],
    outputs:["engineering_completion_report"],
    risk:"HIGH",
    providers:["electrical-engineering-completion"],
    status:"PILOT"
  }
];
