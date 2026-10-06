import {EngineeringArtifact} from "./engineering-artifacts.js";

export const ARTIFACT_RECORD_SCHEMA_VERSION=1 as const;

export interface EngineeringArtifactRecord{
  schemaVersion:typeof ARTIFACT_RECORD_SCHEMA_VERSION;
  projectId?:string;
  artifact:EngineeringArtifact;
  revision:number;
  savedAt:string;
}

export interface ArtifactStore{
  get(artifactId:string):Promise<EngineeringArtifactRecord|undefined>|EngineeringArtifactRecord|undefined;
  save(record:EngineeringArtifactRecord,expectedRevision?:number):Promise<EngineeringArtifactRecord>|EngineeringArtifactRecord;
  delete(artifactId:string):Promise<boolean>|boolean;
  list(projectId?:string):Promise<EngineeringArtifactRecord[]>|EngineeringArtifactRecord[];
}

function validateArtifact(artifact:EngineeringArtifact):void{
  if(!artifact||typeof artifact!=="object") throw new Error("Artifact record artifact is required.");
  if(typeof artifact.id!=="string"||!artifact.id.trim()) throw new Error("Artifact record artifact id is required.");
  if(typeof artifact.kind!=="string"||!artifact.kind.trim()) throw new Error("Artifact record artifact kind is required.");
  if(typeof artifact.name!=="string") throw new Error("Artifact record artifact name must be a string.");
  if(!Array.isArray(artifact.evidenceIds)) throw new Error("Artifact record evidenceIds must be an array.");
  if(artifact.requirementIds!==undefined&&!Array.isArray(artifact.requirementIds)){
    throw new Error("Artifact record requirementIds must be an array when provided.");
  }
  if(!["UNVALIDATED","PASS","FAIL"].includes(artifact.validationStatus)){
    throw new Error("Artifact record validationStatus is invalid.");
  }
  if(typeof artifact.informationStatus!=="string") throw new Error("Artifact record informationStatus is required.");
  if(typeof artifact.createdAt!=="string"||Number.isNaN(Date.parse(artifact.createdAt))){
    throw new Error("Artifact record createdAt must be a valid date string.");
  }
}

export function validateEngineeringArtifactRecord(record:EngineeringArtifactRecord):void{
  if(record.schemaVersion!==ARTIFACT_RECORD_SCHEMA_VERSION){
    throw new Error(`Unsupported artifact record schema version: ${String((record as {schemaVersion?:unknown}).schemaVersion)}.`);
  }
  if(typeof record.projectId!=="string"&&record.projectId!==undefined){
    throw new Error("Artifact record projectId must be a string when provided.");
  }
  if(!Number.isInteger(record.revision)||record.revision<1){
    throw new Error("Artifact record revision must be a positive integer.");
  }
  if(typeof record.savedAt!=="string"||Number.isNaN(Date.parse(record.savedAt))){
    throw new Error("Artifact record savedAt must be a valid date string.");
  }
  validateArtifact(record.artifact);
}

export function createEngineeringArtifactRecord(
  artifact:EngineeringArtifact,
  revision:number,
  projectId?:string,
  savedAt=new Date().toISOString()
):EngineeringArtifactRecord{
  const record:EngineeringArtifactRecord={
    schemaVersion:ARTIFACT_RECORD_SCHEMA_VERSION,
    projectId,
    artifact:structuredClone(artifact),
    revision,
    savedAt
  };
  validateEngineeringArtifactRecord(record);
  return record;
}

export class InMemoryArtifactStore implements ArtifactStore{
  private readonly records=new Map<string,EngineeringArtifactRecord>();

  get(artifactId:string):EngineeringArtifactRecord|undefined{
    const record=this.records.get(artifactId);
    return record?structuredClone(record):undefined;
  }

  save(record:EngineeringArtifactRecord,expectedRevision?:number):EngineeringArtifactRecord{
    validateEngineeringArtifactRecord(record);
    const current=this.records.get(record.artifact.id);

    if(current){
      if(expectedRevision===undefined){
        throw new Error(`Artifact revision is required for update: ${record.artifact.id}.`);
      }
      if(expectedRevision!==current.revision){
        throw new Error(`Artifact revision conflict: expected ${expectedRevision}, current ${current.revision}.`);
      }
      if(record.revision!==current.revision+1){
        throw new Error(`Artifact revision must advance by one: ${record.artifact.id}.`);
      }
    }else{
      if(record.revision!==1){
        throw new Error(`New artifact records must start at revision 1: ${record.artifact.id}.`);
      }
      if(expectedRevision!==undefined&&expectedRevision!==0){
        throw new Error(`Artifact does not exist at expected revision ${expectedRevision}: ${record.artifact.id}.`);
      }
    }

    const stored=structuredClone(record);
    this.records.set(record.artifact.id,stored);
    return structuredClone(stored);
  }

  delete(artifactId:string):boolean{
    return this.records.delete(artifactId);
  }

  list(projectId?:string):EngineeringArtifactRecord[]{
    return [...this.records.values()]
      .filter(record=>projectId===undefined||record.projectId===projectId)
      .map(record=>structuredClone(record));
  }
}
