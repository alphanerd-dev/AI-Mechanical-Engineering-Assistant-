import {InformationStatus} from "../core/types.js";

export type CADArtifactKind="SOURCE"|"SOLID"|"STEP"|"STL"|"THREE_MF"|"DRAWING";

export interface CADArtifact {
  id:string;
  kind:CADArtifactKind;
  name:string;
  uri?:string;
  mediaType?:string;
  backend:string;
  units?:string;
  parameters?:Record<string,unknown>;
  validationStatus:"UNVALIDATED"|"PASS"|"FAIL";
  informationStatus:InformationStatus;
  evidenceIds:string[];
  requirementIds?:string[];
  createdAt:string;
}

export interface GeometryValidation {
  valid:boolean;
  solidCount?:number;
  volumeMm3?:number;
  boundingBoxMm?:{x:number;y:number;z:number};
  warnings:string[];
  checkedBy:string;
}
