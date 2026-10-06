import {InformationStatus} from "../core/types.js";

export type ArtifactKind="CAD_SOURCE"|"CAD_SOLID"|"STEP"|"STL"|"FEA_MODEL"|"FEA_RESULT"|"RESEARCH_EVIDENCE"|"PLM_RECORD";

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
  validationStatus:"UNVALIDATED"|"PASS"|"FAIL";
  informationStatus:InformationStatus;
  evidenceIds:string[];
  createdAt:string;
}

export interface EvidenceRecord {
  id:string;
  type:"SOURCE"|"CALCULATION"|"MEASUREMENT"|"SIMULATION"|"GEOMETRY_CHECK"|"HUMAN_REVIEW";
  claim:string;
  source?:string;
  method?:string;
  value?:unknown;
  status:InformationStatus;
  artifactIds?:string[];
  timestamp:string;
}
