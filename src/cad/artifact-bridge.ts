import {CADAcceptance,evaluateCADAcceptance} from './acceptance.js';
import {CADArtifact,GeometryValidation} from './artifacts.js';
import {EngineeringArtifact,EvidenceRecord} from '../artifacts/engineering-artifacts.js';
import {CADExecutionResult} from './execution.js';

export interface CADArtifactBundle {
  cad:CADArtifact;
  engineering:EngineeringArtifact;
  evidence:EvidenceRecord;
  acceptance:CADAcceptance;
}

export function createCADArtifactBundle(projectId:string,execution:CADExecutionResult,validation:GeometryValidation):CADArtifactBundle{
  const acceptance=evaluateCADAcceptance(validation);
  const now=new Date().toISOString();
  const base=`${projectId}-cad-${Date.now()}`;
  const evidenceId=`${base}-geometry-evidence`;
  const cad:CADArtifact={
    id:`${base}-solid`,kind:'SOLID',name:'Generated CAD solid',backend:execution.backend,
    uri:execution.solidArtifactPath,validationStatus:acceptance.accepted?'PASS':'FAIL',
    informationStatus:acceptance.accepted?'VERIFIED':'CALCULATED',evidenceIds:[evidenceId],createdAt:now
  };
  const engineering:EngineeringArtifact={
    id:`${base}-engineering`,kind:'CAD_SOLID',name:cad.name,uri:cad.uri,backend:cad.backend,
    validationStatus:cad.validationStatus,informationStatus:cad.informationStatus,evidenceIds:[evidenceId],createdAt:now
  };
  const evidence:EvidenceRecord={
    id:evidenceId,type:'GEOMETRY_CHECK',claim:acceptance.accepted?'CAD geometry passed independent validation.':'CAD geometry did not pass independent validation.',
    method:validation.checkedBy,value:validation,status:acceptance.accepted?'VERIFIED':'CALCULATED',artifactIds:[cad.id,engineering.id],timestamp:now
  };
  return {cad,engineering,evidence,acceptance};
}