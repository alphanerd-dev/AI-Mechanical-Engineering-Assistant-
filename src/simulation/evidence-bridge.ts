import {EngineeringMemory} from "../memory/memory-store.js";
import {ProjectState} from "../core/types.js";
import {EngineeringArtifact, EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {FEAModelInput, FEAResult, SimulationValidation} from "./types.js";
import {EngineeringAcceptance} from "./engineering-acceptance.js";
import {createSimulationArtifacts} from "./fea-artifacts.js";
import {recordEvent} from "../state/project.js";

export interface SimulationEvidenceBridgeInput {
  project: ProjectState;
  memory: EngineeringMemory;
  model: FEAModelInput;
  result: FEAResult;
  validation: SimulationValidation;
  acceptance: EngineeringAcceptance;
  solver: string;
  solverVersion: string;
  requirementIds?: string[];
}

export interface SimulationEvidenceBridgeResult {
  modelArtifact: EngineeringArtifact;
  resultArtifact: EngineeringArtifact;
  evidence?: EvidenceRecord;
  eventRecorded: boolean;
}

export function bridgeSimulationEvidence(input: SimulationEvidenceBridgeInput): SimulationEvidenceBridgeResult {
  const artifacts=createSimulationArtifacts(input.project.id,input.model,input.result,input.validation,input.solver,input.solverVersion,input.requirementIds??[]);
  input.memory.saveArtifact(artifacts.modelArtifact);
  input.memory.saveArtifact(artifacts.resultArtifact);

  if(input.acceptance.status!=="ACCEPTED"){
    recordEvent(input.project,{
      actor:"simulation",
      action:"SIMULATION_ACCEPTANCE_BLOCKED",
      input:{result:input.result,validation:input.validation},
      output:input.acceptance,
      evidence:[]
    });
    input.memory.save(input.project);
    return {modelArtifact:artifacts.modelArtifact,resultArtifact:artifacts.resultArtifact,eventRecorded:true};
  }

  const evidence:EvidenceRecord={
    ...artifacts.evidence,
    claim:"Static structural simulation was accepted against configured validation, factor-of-safety, and required mesh-convergence gates.",
    method:"solver + validation + engineering acceptance",
    value:{solver:input.solver,solverVersion:input.solverVersion,acceptance:input.acceptance}
  };

  input.memory.saveEvidence(input.project.id,evidence);
  for(const requirementId of input.requirementIds??[]) input.memory.linkEvidence(input.project.id,requirementId,evidence.id);

  artifacts.modelArtifact.evidenceIds=[evidence.id];
  artifacts.resultArtifact.evidenceIds=[evidence.id];
  input.memory.saveArtifact(artifacts.modelArtifact);
  input.memory.saveArtifact(artifacts.resultArtifact);

  recordEvent(input.project,{
    actor:"simulation",
    action:"SIMULATION_ACCEPTED",
    input:{result:input.result,validation:input.validation},
    output:input.acceptance,
    evidence:[evidence.id]
  });
  input.project.nextAction="Proceed to physical test or the next unmet engineering requirement.";
  input.memory.save(input.project);

  return {modelArtifact:artifacts.modelArtifact,resultArtifact:artifacts.resultArtifact,evidence,eventRecorded:true};
}
