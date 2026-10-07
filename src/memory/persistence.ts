import {ProjectState} from "../core/types.js";
import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts.js";

export const ENGINEERING_MEMORY_SCHEMA_VERSION=1 as const;

export interface EngineeringMemoryArtifactRecord {
  projectId:string;
  artifact:EngineeringArtifact;
}

export interface EngineeringMemorySnapshot {
  schemaVersion:typeof ENGINEERING_MEMORY_SCHEMA_VERSION;
  projectId:string;
  revision:number;
  savedAt:string;
  project:ProjectState;
  evidence:Record<string,EvidenceRecord>;
  artifacts:Record<string,EngineeringMemoryArtifactRecord>;
  requirementEvidence:Record<string,string[]>;
}

export interface EngineeringMemoryStore {
  get(projectId:string):EngineeringMemorySnapshot|undefined;
  save(snapshot:EngineeringMemorySnapshot,expectedRevision?:number):EngineeringMemorySnapshot;
  delete(projectId:string):boolean;
  list():EngineeringMemorySnapshot[];
}

function assertProjectId(projectId:string):void{
  if(typeof projectId!=="string"||!projectId.trim())
    throw new Error("Engineering memory projectId is required.");
}

function validateProject(projectId:string,project:ProjectState):void{
  assertProjectId(projectId);
  if(!project||typeof project!=="object") throw new Error("Engineering memory project is required.");
  if(project.id!==projectId) throw new Error("Engineering memory project id does not match snapshot projectId.");
  if(!Array.isArray(project.requirements)||!Array.isArray(project.assumptions)||
    !Array.isArray(project.openQuestions)||!Array.isArray(project.unresolvedRisks)||
    !Array.isArray(project.events)){
    throw new Error("Engineering memory project collections are invalid.");
  }
}

function validateEvidence(projectId:string,evidence:EvidenceRecord):void{
  if(!evidence||typeof evidence!=="object"||!evidence.id.trim())
    throw new Error("Engineering memory evidence id is required.");
  if(evidence.status!=="VERIFIED")
    throw new Error(`Engineering memory only accepts VERIFIED evidence: ${evidence.id}.`);
  if(typeof evidence.timestamp!=="string"||Number.isNaN(Date.parse(evidence.timestamp)))
    throw new Error(`Engineering memory evidence timestamp is invalid: ${evidence.id}.`);
  for(const artifactId of evidence.artifactIds??[]){
    if(!artifactId.trim()) throw new Error(`Engineering memory evidence artifact id is empty: ${evidence.id}.`);
  }
  for(const requirementId of evidence.requirementIds??[]){
    if(!requirementId.trim()) throw new Error(`Engineering memory evidence requirement id is empty: ${evidence.id}.`);
  }
  void projectId;
}

function validateArtifact(projectId:string,record:EngineeringMemoryArtifactRecord):void{
  if(record.projectId!==projectId)
    throw new Error(`Engineering memory artifact crosses project boundary: ${record.artifact.id}.`);
  const artifact=record.artifact;
  if(!artifact||typeof artifact!=="object"||!artifact.id.trim())
    throw new Error("Engineering memory artifact id is required.");
  if(!Array.isArray(artifact.evidenceIds))
    throw new Error(`Engineering memory artifact evidenceIds must be an array: ${artifact.id}.`);
  if(artifact.createdAt && Number.isNaN(Date.parse(artifact.createdAt)))
    throw new Error(`Engineering memory artifact createdAt is invalid: ${artifact.id}.`);
}

export function validateEngineeringMemorySnapshot(snapshot:EngineeringMemorySnapshot):void{
  if(snapshot.schemaVersion!==ENGINEERING_MEMORY_SCHEMA_VERSION)
    throw new Error(`Unsupported engineering memory schema version: ${String((snapshot as {schemaVersion?:unknown}).schemaVersion)}.`);
  assertProjectId(snapshot.projectId);
  if(!Number.isInteger(snapshot.revision)||snapshot.revision<1)
    throw new Error("Engineering memory revision must be a positive integer.");
  if(typeof snapshot.savedAt!=="string"||Number.isNaN(Date.parse(snapshot.savedAt)))
    throw new Error("Engineering memory savedAt must be a valid date string.");

  validateProject(snapshot.projectId,snapshot.project);

  for(const [id,evidence] of Object.entries(snapshot.evidence)){
    if(evidence.id!==id) throw new Error(`Engineering memory evidence key mismatch: ${id}.`);
    validateEvidence(snapshot.projectId,evidence);
  }

  for(const [id,record] of Object.entries(snapshot.artifacts)){
    if(record.artifact.id!==id) throw new Error(`Engineering memory artifact key mismatch: ${id}.`);
    validateArtifact(snapshot.projectId,record);
  }

  for(const [requirementId,evidenceIds] of Object.entries(snapshot.requirementEvidence)){
    if(!requirementId.trim()||!Array.isArray(evidenceIds))
      throw new Error("Engineering memory requirement evidence map is invalid.");
    for(const evidenceId of evidenceIds){
      if(!snapshot.evidence[evidenceId])
        throw new Error(`Engineering memory links unknown evidence: ${evidenceId}.`);
    }
  }

  for(const evidence of Object.values(snapshot.evidence)){
    for(const artifactId of evidence.artifactIds??[]){
      if(!snapshot.artifacts[artifactId])
        throw new Error(`Engineering memory evidence links unknown artifact: ${artifactId}.`);
    }
    for(const requirementId of evidence.requirementIds??[]){
      if(!snapshot.project.requirements.some(requirement=>requirement.id===requirementId))
        throw new Error(`Engineering memory evidence links unknown requirement: ${requirementId}.`);
    }
  }

  for(const artifact of Object.values(snapshot.artifacts)){
    for(const evidenceId of artifact.artifact.evidenceIds){
      if(!snapshot.evidence[evidenceId])
        throw new Error(`Engineering memory artifact links unknown evidence: ${evidenceId}.`);
    }
    for(const requirementId of artifact.artifact.requirementIds??[]){
      if(!snapshot.project.requirements.some(requirement=>requirement.id===requirementId))
        throw new Error(`Engineering memory artifact links unknown requirement: ${requirementId}.`);
    }
  }
}

export function createEngineeringMemorySnapshot(
  project:ProjectState,
  revision:number,
  evidence:Record<string,EvidenceRecord>={},
  artifacts:Record<string,EngineeringMemoryArtifactRecord>={},
  requirementEvidence:Record<string,string[]>={},
  savedAt=new Date().toISOString()
):EngineeringMemorySnapshot{
  const snapshot:EngineeringMemorySnapshot={
    schemaVersion:ENGINEERING_MEMORY_SCHEMA_VERSION,
    projectId:project.id,
    revision,
    savedAt,
    project:structuredClone(project),
    evidence:structuredClone(evidence),
    artifacts:structuredClone(artifacts),
    requirementEvidence:structuredClone(requirementEvidence)
  };
  validateEngineeringMemorySnapshot(snapshot);
  return snapshot;
}

export function serializeEngineeringMemorySnapshot(snapshot:EngineeringMemorySnapshot):string{
  validateEngineeringMemorySnapshot(snapshot);
  return JSON.stringify(snapshot,null,2);
}

export function deserializeEngineeringMemorySnapshot(serialized:string):EngineeringMemorySnapshot{
  let parsed:unknown;
  try{parsed=JSON.parse(serialized);}
  catch{throw new Error("Engineering memory JSON is invalid.");}
  validateEngineeringMemorySnapshot(parsed as EngineeringMemorySnapshot);
  return structuredClone(parsed as EngineeringMemorySnapshot);
}

export class InMemoryEngineeringMemoryStore implements EngineeringMemoryStore{
  private readonly snapshots=new Map<string,EngineeringMemorySnapshot>();

  get(projectId:string):EngineeringMemorySnapshot|undefined{
    const snapshot=this.snapshots.get(projectId);
    return snapshot?structuredClone(snapshot):undefined;
  }

  save(snapshot:EngineeringMemorySnapshot,expectedRevision?:number):EngineeringMemorySnapshot{
    validateEngineeringMemorySnapshot(snapshot);
    const current=this.snapshots.get(snapshot.projectId);

    if(current){
      if(expectedRevision===undefined)
        throw new Error(`Engineering memory revision is required for update: ${snapshot.projectId}.`);
      if(expectedRevision!==current.revision)
        throw new Error(`Engineering memory revision conflict: expected ${expectedRevision}, current ${current.revision}.`);
      if(snapshot.revision!==current.revision+1)
        throw new Error(`Engineering memory revision must advance by one: ${snapshot.projectId}.`);
    }else{
      if(snapshot.revision!==1)
        throw new Error(`New engineering memory snapshots must start at revision 1: ${snapshot.projectId}.`);
      if(expectedRevision!==undefined&&expectedRevision!==0)
        throw new Error(`Engineering memory project does not exist at expected revision ${expectedRevision}: ${snapshot.projectId}.`);
    }

    const stored=structuredClone(snapshot);
    this.snapshots.set(snapshot.projectId,stored);
    return structuredClone(stored);
  }

  delete(projectId:string):boolean{
    return this.snapshots.delete(projectId);
  }

  list():EngineeringMemorySnapshot[]{
    return [...this.snapshots.values()].map(snapshot=>structuredClone(snapshot));
  }
}
