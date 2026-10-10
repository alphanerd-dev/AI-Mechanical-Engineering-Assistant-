import {InformationStatus} from "../core/types.js";
import {ArtifactProvenance} from "../artifacts/engineering-artifacts.js";
import {CADExecutionBackend} from "./execution.js";
import {CADGeometryMetrics} from "./metrics.js";

export type CADArtifactKind="SOURCE"|"SOLID"|"STEP"|"STL"|"THREE_MF"|"DRAWING";

export interface CADExecutionProvenance extends ArtifactProvenance {
  sourceType:"CAD_EXECUTION";
  projectId:string;
  modelIdentityId:string;
  executionId:string;
  providerId:string;
  backend:CADExecutionBackend;
  sourceSha256:string;
  sourceFilename:string;
  sourceArtifactUri?:string;
  generatedAt:string;
}

export interface CADArtifactProvenance extends CADExecutionProvenance {
  outputUri:string;
  /** SHA-256 of exact output bytes, computed on the trusted host boundary. */
  artifactSha256?:string;
}

export interface CADArtifact {
  id:string;
  kind:CADArtifactKind;
  name:string;
  uri?:string;
  mediaType?:string;
  backend:string;
  units?:string;
  parameters?:Record<string,unknown>;
  provenance?:CADArtifactProvenance;
  validationStatus:"UNVALIDATED"|"PASS"|"FAIL";
  informationStatus:InformationStatus;
  evidenceIds:string[];
  requirementIds?:string[];
  createdAt:string;
}

export interface GeometryValidation extends CADGeometryMetrics {
  valid:boolean;
  warnings:string[];
  checkedBy:string;
}
