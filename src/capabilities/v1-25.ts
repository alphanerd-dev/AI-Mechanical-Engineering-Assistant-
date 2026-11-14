import { CapabilityDefinition } from "../core/types.js";

export const V1_25_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: "ANALYSIS.CFD_LAMINAR_CHANNEL",
    domain: "fluids",
    purpose: "Run the versioned OpenFOAM 14 laminar-channel benchmark and validate its velocity profile, integrated mass flow and solver residuals",
    inputs: ["caseId", "meanVelocityMps", "heightM", "depthM", "densityKgM3", "kinematicViscosityM2PerS", "mesh.cellsVertical", "solver"],
    outputs: ["cfd_result", "numerical_validation", "integrated_mass_flow", "mesh_artifact", "field_artifacts"],
    preconditions: ["Hydraulic-diameter Reynolds number below 1000", "Bounded structured mesh and solver runtime", "OpenFOAM 14 worker available"],
    postconditions: ["Independent analytical Poiseuille validation", "Integrated mass-flow error within 0.5%", "Source solver and field artifacts identified by SHA-256"],
    risk: "HIGH",
    providers: ["simulation.openfoam"],
    status: "EXPERIMENTAL",
    validator: "validateOpenFOAMLaminarChannelResult"
  }
];
