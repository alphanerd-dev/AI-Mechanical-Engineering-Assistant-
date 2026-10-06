import { FEAResult, SimulationValidation } from "./types.js";
import { FactorOfSafetyCheck, MeshConvergenceCheck, checkFactorOfSafety, checkMeshConvergence } from "./acceptance.js";

export interface EngineeringAcceptanceInput {
  result: FEAResult;
  validation: SimulationValidation;
  yieldStrengthMpa: number;
  minimumFactorOfSafety: number;
  coarseResult?: FEAResult;
  maximumRelativeStressChange?: number;
}

export interface EngineeringAcceptance {
  accepted: boolean;
  status: "ACCEPTED" | "REJECTED" | "INCOMPLETE";
  factorOfSafety: FactorOfSafetyCheck;
  meshConvergence?: MeshConvergenceCheck;
  blockingReasons: string[];
  warnings: string[];
  missingEvidence: string[];
}

export function evaluateEngineeringAcceptance(input: EngineeringAcceptanceInput): EngineeringAcceptance {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const missingEvidence: string[] = [];

  if (!input.validation.pass) blockingReasons.push("Simulation validation failed.");

  const factorOfSafety = checkFactorOfSafety(input.yieldStrengthMpa, input.result.maxStressMpa, input.minimumFactorOfSafety);
  if (!factorOfSafety.pass) blockingReasons.push("Required factor of safety was not achieved.");

  let meshConvergence: MeshConvergenceCheck | undefined;
  const meshRequired = input.maximumRelativeStressChange !== undefined;

  if (meshRequired && input.coarseResult) {
    meshConvergence = checkMeshConvergence({
      coarse: input.coarseResult,
      refined: input.result,
      maximumRelativeStressChange: input.maximumRelativeStressChange!
    });
    if (!meshConvergence.pass) blockingReasons.push("Mesh convergence criterion was not achieved.");
  } else if (meshRequired) {
    missingEvidence.push("A coarse-mesh result is required to evaluate the configured mesh-convergence tolerance.");
  } else {
    warnings.push("Mesh convergence evidence was not requested.");
  }

  const status = blockingReasons.length > 0 ? "REJECTED" : missingEvidence.length > 0 ? "INCOMPLETE" : "ACCEPTED";
  return { accepted: status === "ACCEPTED", status, factorOfSafety, meshConvergence, blockingReasons, warnings, missingEvidence };
}
