import {ProjectState} from "../core/types.js";

export const WORKSPACE_SNAPSHOT_SCHEMA_VERSION=1 as const;

export interface EngineeringWorkspaceSnapshot{
  schemaVersion:typeof WORKSPACE_SNAPSHOT_SCHEMA_VERSION;
  project:ProjectState;
  revision:number;
  savedAt:string;
}

export interface ProjectStateStore{
  get(projectId:string):Promise<EngineeringWorkspaceSnapshot|undefined>|EngineeringWorkspaceSnapshot|undefined;
  save(project:ProjectState,expectedRevision?:number):Promise<EngineeringWorkspaceSnapshot>|EngineeringWorkspaceSnapshot;
  delete(projectId:string):Promise<boolean>|boolean;
  list():Promise<EngineeringWorkspaceSnapshot[]>|EngineeringWorkspaceSnapshot[];
}

function validateProjectState(project:ProjectState):void{
  if(!project||typeof project!=="object") throw new Error("Workspace snapshot project is required.");
  if(typeof project.id!=="string"||!project.id.trim()) throw new Error("Workspace snapshot project id is required.");
  if(typeof project.name!=="string") throw new Error("Workspace snapshot project name must be a string.");
  if(!Array.isArray(project.requirements)) throw new Error("Workspace snapshot requirements must be an array.");
  if(!Array.isArray(project.assumptions)) throw new Error("Workspace snapshot assumptions must be an array.");
  if(!Array.isArray(project.openQuestions)) throw new Error("Workspace snapshot open questions must be an array.");
  if(!Array.isArray(project.unresolvedRisks)) throw new Error("Workspace snapshot unresolved risks must be an array.");
  if(!Array.isArray(project.events)) throw new Error("Workspace snapshot events must be an array.");
}

export function validateEngineeringWorkspaceSnapshot(snapshot:EngineeringWorkspaceSnapshot):void{
  if(snapshot.schemaVersion!==WORKSPACE_SNAPSHOT_SCHEMA_VERSION){
    throw new Error(`Unsupported workspace snapshot schema version: ${String((snapshot as {schemaVersion?:unknown}).schemaVersion)}.`);
  }
  if(!Number.isInteger(snapshot.revision)||snapshot.revision<1){
    throw new Error("Workspace snapshot revision must be a positive integer.");
  }
  if(typeof snapshot.savedAt!=="string"||Number.isNaN(Date.parse(snapshot.savedAt))){
    throw new Error("Workspace snapshot savedAt must be a valid date string.");
  }
  validateProjectState(snapshot.project);
}

export function createEngineeringWorkspaceSnapshot(
  project:ProjectState,
  revision:number,
  savedAt=new Date().toISOString()
):EngineeringWorkspaceSnapshot{
  const snapshot:EngineeringWorkspaceSnapshot={
    schemaVersion:WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    project:structuredClone(project),
    revision,
    savedAt
  };
  validateEngineeringWorkspaceSnapshot(snapshot);
  return snapshot;
}

export function serializeEngineeringWorkspaceSnapshot(snapshot:EngineeringWorkspaceSnapshot):string{
  validateEngineeringWorkspaceSnapshot(snapshot);
  return JSON.stringify(snapshot,null,2);
}

export function deserializeEngineeringWorkspaceSnapshot(serialized:string):EngineeringWorkspaceSnapshot{
  let parsed:unknown;
  try{
    parsed=JSON.parse(serialized);
  }catch{
    throw new Error("Workspace snapshot JSON is invalid.");
  }
  validateEngineeringWorkspaceSnapshot(parsed as EngineeringWorkspaceSnapshot);
  return structuredClone(parsed as EngineeringWorkspaceSnapshot);
}

export class InMemoryProjectStateStore implements ProjectStateStore{
  private readonly snapshots=new Map<string,EngineeringWorkspaceSnapshot>();

  get(projectId:string):EngineeringWorkspaceSnapshot|undefined{
    const snapshot=this.snapshots.get(projectId);
    return snapshot?structuredClone(snapshot):undefined;
  }

  save(project:ProjectState,expectedRevision?:number):EngineeringWorkspaceSnapshot{
    const current=this.snapshots.get(project.id);
    if(current){
      if(expectedRevision===undefined){
        throw new Error(`Project revision is required for update: ${project.id}.`);
      }
      if(expectedRevision!==current.revision){
        throw new Error(`Project revision conflict: expected ${expectedRevision}, current ${current.revision}.`);
      }
    }else if(expectedRevision!==undefined&&expectedRevision!==0){
      throw new Error(`Project does not exist at expected revision ${expectedRevision}: ${project.id}.`);
    }

    const snapshot=createEngineeringWorkspaceSnapshot(
      project,
      current?current.revision+1:1
    );
    this.snapshots.set(project.id,structuredClone(snapshot));
    return structuredClone(snapshot);
  }

  delete(projectId:string):boolean{
    return this.snapshots.delete(projectId);
  }

  list():EngineeringWorkspaceSnapshot[]{
    return [...this.snapshots.values()].map(snapshot=>structuredClone(snapshot));
  }
}
