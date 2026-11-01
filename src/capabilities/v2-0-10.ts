import {CapabilityDefinition} from "../core/types.js";

export const V2_0_10_CAPABILITIES:CapabilityDefinition[]=[
  {
    id:"ENGINEERING.COMPLETE_SHAFT",
    domain:"orchestration",
    purpose:"Complete a geometry-based preliminary shaft static-yield analysis, deriving gear forces and bending moment from explicit shaft/gear geometry before deterministic calculation and review",
    inputs:[
      "projectId","powerKw","speedRpm","bearingSpanMm","gearPositionFromLeftMm",
      "pitchDiameterMm","pressureAngleDeg","materialGrade","yieldStrengthMpa",
      "ultimateTensileStrengthMpa","designFactor","axialLoadN",
      "bendingStressFactorKb","torsionalStressFactorKts","candidateDiameterMm","approval"
    ],
    outputs:["engineering_completion_report"],
    risk:"HIGH",
    providers:["engineering-completion"],
    status:"PILOT"
  }
];
