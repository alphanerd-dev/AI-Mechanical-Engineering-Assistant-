import { CapabilityDefinition } from "../core/types.js";

export const V1_25_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: "ANALYSIS.CFD_LAMINAR_CHANNEL",
    domain: "fluids",
    purpose: "Run the versioned OpenFOAM 14 laminar-channel benchmark and validate its velocity profile, pressure drop, mass conservation and solver residuals",
    inputs: ["caseId", "meanVelocityMps", "heightM", "lengthM", "depthM", "densityKgM3", "kinematicViscosityM2PerS", "mesh", "solver"],
    outputs: ["cfd_result", "numerical_validation", "mesh_artifact", "field_artifacts"],
    preconditions: ["Hydraulic-diameter Reynolds number below 1000", "Bounded structured mesh and solver runtime", "OpenFOAM 14 worker available"],
    postconditions: ["Independent analytical Poiseuille validation", "Mass conservation within 0.5%", "Source solver and field artifacts identified by SHA-256"],
    risk: "HIGH",
    providers: ["simulation.openfoam"],
    status: "EXPERIMENTAL",
    validator: "validateOpenFOAMLaminarChannelResult"
  }
];
