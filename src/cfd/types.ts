export const OPENFOAM_LAMINAR_CHANNEL_CASE_ID = "laminar-channel-poiseuille-v1" as const;

export interface OpenFOAMLaminarChannelRequest {
  caseId: typeof OPENFOAM_LAMINAR_CHANNEL_CASE_ID;
  meanVelocityMps: number;
  heightM: number;
  depthM: number;
  densityKgM3: number;
  kinematicViscosityM2PerS: number;
  mesh: {
    cellsVertical: number;
  };
  solver: {
    maxIterations: number;
    residualTolerance: number;
    timeoutSeconds: number;
  };
}

export interface OpenFOAMVelocitySample {
  yM: number;
  axialVelocityMps: number;
}

export interface OpenFOAMRunArtifact {
  kind: "MESH" | "VELOCITY_FIELD" | "PRESSURE_FIELD" | "SOLVER_LOG";
  path: string;
  mediaType: string;
  sha256: string;
}

export interface OpenFOAMLaminarChannelResult {
  jobId?: string;
  status: "COMPLETED" | "FAILED";
  solver: "OpenFOAM";
  solverVersion: string;
  converged: boolean;
  meshCells: number;
  massFluxKgS?: number;
  residuals?: {
    pressure: number;
    velocity: number;
  };
  velocityProfile: OpenFOAMVelocitySample[];
  artifacts: OpenFOAMRunArtifact[];
  warnings: string[];
}

export interface CFDValidationCheck {
  name: string;
  pass: boolean;
  message: string;
  measured?: number;
  expected?: number;
  tolerance?: number;
}

export interface OpenFOAMLaminarChannelValidation {
  status: "PASS" | "INCOMPLETE" | "FAIL";
  reynoldsNumber: number;
  expectedMassFluxKgS: number;
  normalizedProfileRmse?: number;
  massFluxRelativeError?: number;
  checks: CFDValidationCheck[];
  blockingReasons: string[];
  warnings: string[];
}
