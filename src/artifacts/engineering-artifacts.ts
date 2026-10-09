import {InformationStatus} from "../core/types";

export type ArtifactKind="CAD_SOURCE"|"CAD_SOLID"|"STEP"|"STL"|"FEA_MODEL"|"FEA_RESULT"|"CALCULATION_RESULT"|"RESEARCH_EVIDENCE"|"PLM_RECORD"|"MANUFACTURING_PROCESS_PLAN"|"MANUFACTURING_RECORD";

export type ArtifactProvenanceSourceType="CAD_EXECUTION"|"SIMULATION"|"IMPORT"|"DERIVED"|"MEASUREMENT"|"RESEARCH";

/**
 * Provider-neutral lineage metadata for an engineering artifact.
 * A source digest must describe exactly what was hashed; it is not implicitly an output-file digest.
 */
export interface ArtifactProvenance {
  schemaVersion:1;
  sourceType:ArtifactProvenanceSourceType;
  projectId:string;
  providerId:string;
  executionId:string;
  generatedAt:string;
  modelIdentityId?:string;
  backend?:string;
  sourceSha256?:string;
  sourceArtifactIds?:string[];
}

export interface EngineeringArtifact {
  id:string;
  kind:ArtifactKind;
  name:string;
  uri?:string;
  mediaType?:string;
  backend?:string;
  version?:string;
  units?:string;
  parameters?:Record<string,unknown>;
  provenance?:ArtifactProvenance;
  validationStatus:"UNVALIDATED"|"PASS"|"FAIL";
  informationStatus:InformationStatus;
  evidenceIds:string[];
  requirementIds?:string[];
  createdAt:string;
}

export interface EvidenceRecord {
  id:string;
  type:"SOURCE"|"CALCULATION"|"MEASUREMENT"|"SIMULATION"|"GEOMETRY_CHECK"|"MANUFACTURING_CHECK"|"HUMAN_REVIEW";
  claim:string;
  source?:string;
  method?:string;
  value?:unknown;
  status:InformationStatus;
  artifactIds?:string[];
  requirementIds?:string[];
  timestamp:string;
}
