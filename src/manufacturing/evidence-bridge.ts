import {EvidenceRecord,EngineeringArtifact} from "../artifacts/engineering-artifacts.js";
import {ProjectState} from "../core/types.js";
import {EngineeringMemory} from "../memory/memory-store.js";
import {recordEvent} from "../state/project.js";
import {ManufacturingInspectionAcceptance,ManufacturingInspectionCriterion,ManufacturingInspectionResult,ManufacturingProcessPlan,ManufacturingPlanValidation} from "./types.js";

export interface ManufacturingEvidenceBridgeInput{
  project:ProjectState;
  memory:EngineeringMemory;
  plan:ManufacturingProcessPlan;
  planValidation:ManufacturingPlanValidation;
  criterion:ManufacturingInspectionCriterion;
  inspection:ManufacturingInspectionResult;
  acceptance:ManufacturingInspectionAcceptance;
}

export interface ManufacturingEvidenceBridgeResult{
  processArtifact:EngineeringArtifact;
  inspectionArtifact:EngineeringArtifact;
  evidence?:EvidenceRecord;
  eventRecorded:boolean;
}

export function bridgeManufacturingEvidence(input:ManufacturingEvidenceBridgeInput):ManufacturingEvidenceBridgeResult{
  const now=new Date().toISOString();
  const base=input.project.id+"-mfg-"+Date.now();
  const projectRequirements=new Set(input.project.requirements.map(requirement=>requirement.id));
  const invalidRequirementIds=input.plan.requirementIds.filter(id=>!projectRequirements.has(id));
  const bridgeBlocked=input.plan.projectId!==input.project.id||invalidRequirementIds.length>0;

  const processArtifact:EngineeringArtifact={
    id:base+"-process-plan",
    kind:"MANUFACTURING_PROCESS_PLAN",
    name:input.plan.name,
    backend:"manufacturing-core",
    validationStatus:input.planValidation.status==="PASS"&&!bridgeBlocked?"PASS":"FAIL",
    informationStatus:input.planValidation.status==="PASS"&&!bridgeBlocked?"VERIFIED":"CALCULATED",
    evidenceIds:[],
    requirementIds:[...input.plan.requirementIds],
    createdAt:now,
    parameters:{operations:input.plan.operations.length,status:input.plan.status}
  };

  const inspectionArtifact:EngineeringArtifact={
    id:base+"-inspection",
    kind:"MANUFACTURING_RECORD",
    name:input.criterion.name,
    backend:"manufacturing-core",
    validationStatus:input.acceptance.status==="ACCEPTED"&&!bridgeBlocked?"PASS":input.acceptance.status==="REJECTED"?"FAIL":"UNVALIDATED",
    informationStatus:input.acceptance.status==="ACCEPTED"&&!bridgeBlocked?"VERIFIED":"MEASURED",
    evidenceIds:[],
    requirementIds:[...input.plan.requirementIds],
    createdAt:now,
    units:input.criterion.unit,
    parameters:{
      measuredValue:input.inspection.measuredValue,
      measuredUnit:input.inspection.unit,
      instrument:input.inspection.instrument,
      method:input.criterion.method
    }
  };

  input.memory.saveArtifact(processArtifact);
  input.memory.saveArtifact(inspectionArtifact);

  if(input.planValidation.status!=="PASS"||input.acceptance.status!=="ACCEPTED"||bridgeBlocked){
    recordEvent(input.project,{
      actor:"manufacturing",
      action:"MANUFACTURING_ACCEPTANCE_BLOCKED",
      input:{plan:input.plan,criterion:input.criterion,inspection:input.inspection},
      output:{planValidation:input.planValidation,acceptance:input.acceptance,bridgeBlocked,invalidRequirementIds},
      evidence:[]
    });
    input.memory.save(input.project);
    return {processArtifact,inspectionArtifact,eventRecorded:true};
  }

  const evidence:EvidenceRecord={
    id:base+"-inspection-evidence",
    type:"MANUFACTURING_CHECK",
    claim:"Manufacturing inspection passed for "+input.criterion.characteristic+".",
    method:input.criterion.method,
    value:{
      measuredValue:input.inspection.measuredValue,
      unit:input.inspection.unit,
      lowerLimit:input.acceptance.lowerLimit,
      upperLimit:input.acceptance.upperLimit,
      instrument:input.inspection.instrument
    },
    status:"VERIFIED",
    artifactIds:[processArtifact.id,inspectionArtifact.id],
    requirementIds:[...input.plan.requirementIds],
    timestamp:now
  };

  processArtifact.evidenceIds=[evidence.id];
  inspectionArtifact.evidenceIds=[evidence.id];
  input.memory.saveArtifact(processArtifact);
  input.memory.saveArtifact(inspectionArtifact);
  input.memory.saveEvidence(input.project.id,evidence);

  for(const requirementId of input.plan.requirementIds)
    input.memory.linkEvidence(input.project.id,requirementId,evidence.id);

  recordEvent(input.project,{
    actor:"manufacturing",
    action:"MANUFACTURING_CHECK_ACCEPTED",
    input:{criterion:input.criterion,inspection:input.inspection},
    output:input.acceptance,
    evidence:[evidence.id]
  });
  input.project.nextAction="Continue with remaining manufacturing checks or proceed to final verification.";
  input.memory.save(input.project);

  return {processArtifact,inspectionArtifact,evidence,eventRecorded:true};
}
