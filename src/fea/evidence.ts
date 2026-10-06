import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {EngineeringMemory} from "../memory/memory-store.js";
import {ProjectState} from "../core/types.js";
import {recordEvent} from "../state/project.js";
import {FEAExecutionValidation} from "./validation.js";
import {FEAStaticStructuralRequest,FEAStaticStructuralResult} from "./types.js";

export function createFEAArtifacts(
  projectId:string,
  request:FEAStaticStructuralRequest,
  result:FEAStaticStructuralResult,
  validation:FEAExecutionValidation,
  requirementIds:string[]=[]
):{modelArtifact:EngineeringArtifact;resultArtifact:EngineeringArtifact;evidence:EvidenceRecord}{
  const now=new Date().toISOString();
  const validationStatus=validation.status==="PASS"?"PASS":validation.status==="FAIL"?"FAIL":"UNVALIDATED";
  const modelArtifact:EngineeringArtifact={
    id:`fea-model:${projectId}:${request.id}`,
    kind:"FEA_MODEL",
    name:"Static structural FEA model",
    backend:result.solver,
    version:result.solverVersion,
    parameters:{request,mesh:result.mesh},
    validationStatus,
    informationStatus:"CALCULATED",
    evidenceIds:[],
    requirementIds:[...requirementIds],
    createdAt:now
  };
  const resultArtifact:EngineeringArtifact={
    id:`fea-result:${projectId}:${request.id}`,
    kind:"FEA_RESULT",
    name:"Static structural FEA result",
    backend:result.solver,
    version:result.solverVersion,
    parameters:{result,validation},
    validationStatus,
    informationStatus:"CALCULATED",
    evidenceIds:[],
    requirementIds:[...requirementIds],
    createdAt:now
  };
  const evidence:EvidenceRecord={
    id:`fea-execution-evidence:${projectId}:${request.id}`,
    type:"SIMULATION",
    claim:"The FEA solver executed and the normalized result passed execution-integrity checks; this evidence does not establish design safety or requirement compliance.",
    method:"Gmsh mesh generation + CalculiX solve + normalized result validation",
    value:{solver:result.solver,solverVersion:result.solverVersion,validation},
    status:validation.status==="PASS"?"VERIFIED":"CALCULATED",
    artifactIds:[modelArtifact.id,resultArtifact.id],
    requirementIds:[...requirementIds],
    timestamp:now
  };
  modelArtifact.evidenceIds=[evidence.id];
  resultArtifact.evidenceIds=[evidence.id];
  return {modelArtifact,resultArtifact,evidence};
}

export function bridgeFEAExecution(input:{
  project:ProjectState;
  memory:EngineeringMemory;
  request:FEAStaticStructuralRequest;
  result:FEAStaticStructuralResult;
  validation:FEAExecutionValidation;
  requirementIds?:string[];
}):{modelArtifact:EngineeringArtifact;resultArtifact:EngineeringArtifact;evidence?:EvidenceRecord;eventRecorded:boolean}{
  const artifacts=createFEAArtifacts(
    input.project.id,
    input.request,
    input.result,
    input.validation,
    input.requirementIds??[]
  );
  input.memory.saveArtifact(artifacts.modelArtifact);
  input.memory.saveArtifact(artifacts.resultArtifact);

  if(input.validation.status!=="PASS"){
    recordEvent(input.project,{
      actor:"fea",
      action:"FEA_EXECUTION_VALIDATION_BLOCKED",
      input:{request:input.request,result:input.result},
      output:input.validation,
      evidence:[]
    });
    input.memory.save(input.project);
    return {modelArtifact:artifacts.modelArtifact,resultArtifact:artifacts.resultArtifact,eventRecorded:true};
  }

  input.memory.saveEvidence(input.project.id,artifacts.evidence);
  for(const requirementId of input.requirementIds??[]) input.memory.linkEvidence(input.project.id,requirementId,artifacts.evidence.id);

  recordEvent(input.project,{
    actor:"fea",
    action:"FEA_EXECUTION_VERIFIED",
    input:{request:input.request,result:input.result},
    output:input.validation,
    evidence:[artifacts.evidence.id]
  });
  input.memory.save(input.project);
  return {modelArtifact:artifacts.modelArtifact,resultArtifact:artifacts.resultArtifact,evidence:artifacts.evidence,eventRecorded:true};
}
