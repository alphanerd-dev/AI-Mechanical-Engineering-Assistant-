import {EngineeringWorkspaceSnapshot,ENGINEERING_WORKSPACE_SCHEMA_VERSION} from "./types";
import {validateEngineeringTaskGraph} from "../task-graph/validation";
import {validateCalculationArtifact} from "../artifacts/calculation-artifact.js";

export function validateEngineeringWorkspaceSnapshot(snapshot:EngineeringWorkspaceSnapshot):void{
  if(snapshot.schemaVersion!==ENGINEERING_WORKSPACE_SCHEMA_VERSION)
    throw new Error(`Unsupported engineering workspace schema version: ${String((snapshot as {schemaVersion?:unknown}).schemaVersion)}.`);
  if(!snapshot.id.trim()) throw new Error("Engineering workspace id is required.");
  if(!snapshot.name.trim()) throw new Error("Engineering workspace name is required.");
  if(!Number.isInteger(snapshot.revision)||snapshot.revision<1) throw new Error("Engineering workspace revision must be a positive integer.");
  if(typeof snapshot.savedAt!=="string"||Number.isNaN(Date.parse(snapshot.savedAt))) throw new Error("Engineering workspace savedAt must be a valid date string.");
  if(!snapshot.project||snapshot.project.id!==snapshot.taskGraph.projectId)
    throw new Error("Engineering workspace project and task graph project ids must match.");
  if(snapshot.productModelRevision!==undefined&&(!Number.isInteger(snapshot.productModelRevision)||snapshot.productModelRevision<1))
    throw new Error("Engineering workspace productModelRevision must be a positive integer.");
  if(snapshot.artifactRegistryRevision!==undefined&&(!Number.isInteger(snapshot.artifactRegistryRevision)||snapshot.artifactRegistryRevision<1))
    throw new Error("Engineering workspace artifactRegistryRevision must be a positive integer.");
  if(snapshot.artifacts!==undefined){
    if(!Array.isArray(snapshot.artifacts)) throw new Error("Engineering workspace artifacts must be an array.");
    const artifactIds=new Set<string>();
    for(const artifact of snapshot.artifacts){
      const artifactErrors=validateCalculationArtifact(artifact);
      if(artifactErrors.length) throw new Error(artifactErrors.join(" "));
      if(artifact.projectId!==snapshot.project.id) throw new Error("Calculation artifact projectId must match the workspace project.");
      if(artifact.sourceRevision>artifact.workspaceRevision) throw new Error("Calculation artifact sourceRevision cannot exceed its workspaceRevision.");
      if(artifact.workspaceRevision>snapshot.revision) throw new Error("Calculation artifact workspaceRevision cannot exceed the saved workspace revision.");
      if(artifactIds.has(artifact.id)) throw new Error("Calculation artifact IDs must be unique within the workspace.");
      artifactIds.add(artifact.id);
    }
  }
  const taskErrors=validateEngineeringTaskGraph(snapshot.taskGraph);
  if(taskErrors.length) throw new Error(taskErrors.join(" "));
}

export function serializeEngineeringWorkspaceSnapshot(snapshot:EngineeringWorkspaceSnapshot):string{
  validateEngineeringWorkspaceSnapshot(snapshot);
  return JSON.stringify(snapshot,null,2);
}

export function deserializeEngineeringWorkspaceSnapshot(serialized:string):EngineeringWorkspaceSnapshot{
  let parsed:unknown;
  try{parsed=JSON.parse(serialized);}catch{throw new Error("Engineering workspace JSON is invalid.");}
  validateEngineeringWorkspaceSnapshot(parsed as EngineeringWorkspaceSnapshot);
  return structuredClone(parsed as EngineeringWorkspaceSnapshot);
}
