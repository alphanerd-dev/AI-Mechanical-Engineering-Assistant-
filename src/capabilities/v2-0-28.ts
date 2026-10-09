import { CapabilityDefinition } from "../core/types.js";

export const V2_0_28_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: "ANALYSIS.SENSIBLE_SPECIFIC_ENERGY",
    domain: "thermal",
    purpose: "Calculate single-phase sensible energy per unit mass from explicit specific heat and temperature bounds",
    inputs: ["specificHeatJPerKgK", "inletTemperatureC", "outletTemperatureC"],
    outputs: ["specificEnergyKjPerKg"],
    risk: "LOW",
    providers: ["thermal-analysis"],
    status: "VERIFIED"
  },
  {
    id: "ANALYSIS.SENSIBLE_HEAT_DUTY",
    domain: "thermal",
    purpose: "Calculate steady-state sensible heating duty from explicit mass flow and calculated specific energy",
    inputs: ["massFlowKgPerS", "specificEnergyKjPerKg"],
    outputs: ["heatDutyKw"],
    risk: "LOW",
    providers: ["thermal-analysis"],
    status: "VERIFIED"
  },
  {
    id: "ENGINEERING.COMPLETE_SENSIBLE_HEATING",
    domain: "orchestration",
    purpose: "Complete a bounded single-phase sensible heating-duty workflow through deterministic calculations, explicit limit validation, traceable evidence, and human approval",
    inputs: ["projectId", "massFlowKgPerS", "specificHeatJPerKgK", "inletTemperatureC", "outletTemperatureC", "maximumHeatDutyKw", "approval"],
    outputs: ["engineering_completion_report"],
    risk: "HIGH",
    providers: ["thermal-engineering-completion"],
    status: "PILOT"
  }
];
