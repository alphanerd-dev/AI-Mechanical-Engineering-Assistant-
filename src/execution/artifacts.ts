export type ArtifactKind="CAD"|"MESH"|"RESULT"|"REPORT"|"DRAWING"|"SOURCE"|"OTHER";

export interface EngineeringArtifact {
  id:string;
  kind:ArtifactKind;
  name:string;
  mediaType:string;
  uri:string;
  sha256?:string;
  sizeBytes?:number;
  createdAt:string;
  provider?:string;
  providerVersion?:string;
  projectId?:string;
  metadata?:Record<string,unknown>;
}

export interface EngineeringEvidence {
  id:string;
  type:"EXECUTION"|"CALCULATION"|"VALIDATION"|"RESEARCH"|"MEASUREMENT"|"APPROVAL";
  statement:string;
  artifactIds?:string[];
  executionId?:string;
  sourceIds?:string[];
  createdAt:string;
  status:"ASSUMED"|"CALCULATED"|"MEASURED"|"VERIFIED";
  metadata?:Record<string,unknown>;
}
