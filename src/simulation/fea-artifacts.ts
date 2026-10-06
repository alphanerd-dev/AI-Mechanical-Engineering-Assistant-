import { EngineeringArtifact, EvidenceRecord } from "../artifacts/engineering-artifacts.js";
import { FEAModelInput, FEAResult, SimulationValidation } from "./types.js";

export function createSimulationArtifacts(
  projectId: string,
  model: FEAModelInput,
  result: FEAResult,
  validation: SimulationValidation,
  solver: string,
  solverVersion: string
): { modelArtifact: EngineeringArtifact; resultArtifact: EngineeringArtifact; evidence: EvidenceRecord } {
  const now = new Date().toISOString();
  const pass = validation.pass;
  const modelArtifact: EngineeringArtifact = {
    id: `fea-model:${projectId}:${now}`,
    kind: "FEA_MODEL",
    name: "Static structural FEA model",
    backend: solver,
    version: solverVersion,
    parameters: { artifactId: model.artifactId, material: model.material, loads: model.loads, constraints: model.constraints, mesh: model.mesh },
    validationStatus: pass ? "PASS" : "FAIL",
    informationStatus: "CALCULATED",
    evidenceIds: [],
    createdAt: now
  };
  const resultArtifact: EngineeringArtifact = {
    id: `fea-result:${projectId}:${now}`,
    kind: "FEA_RESULT",
    name: "Static structural FEA result",
    backend: solver,
    version: solverVersion,
    parameters: { result, validation },
    validationStatus: pass ? "PASS" : "FAIL",
    informationStatus: "CALCULATED",
    evidenceIds: [],
    createdAt: now
  };
  const evidence: EvidenceRecord = {
    id: `simulation-evidence:${projectId}:${now}`,
    type: "SIMULATION",
    claim: pass ? "Static structural simulation passed configured validation checks." : "Static structural simulation failed configured validation checks.",
    method: "solver + validation gates",
    value: { solver, solverVersion, validation },
    status: pass ? "VERIFIED" : "CALCULATED",
    artifactIds: [modelArtifact.id, resultArtifact.id],
    timestamp: now
  };
  modelArtifact.evidenceIds = [evidence.id];
  resultArtifact.evidenceIds = [evidence.id];
  return { modelArtifact, resultArtifact, evidence };
}
