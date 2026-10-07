import {EngineeringWorkspaceSnapshot} from "./types.js";
import {validateEngineeringWorkspaceSnapshot} from "./validation.js";

export interface EngineeringWorkspaceStore{
  get(workspaceId:string):EngineeringWorkspaceSnapshot|undefined|Promise<EngineeringWorkspaceSnapshot|undefined>;
  save(workspace:EngineeringWorkspaceSnapshot,expectedRevision?:number):EngineeringWorkspaceSnapshot|Promise<EngineeringWorkspaceSnapshot>;
  delete(workspaceId:string):boolean|Promise<boolean>;
  list():EngineeringWorkspaceSnapshot[]|Promise<EngineeringWorkspaceSnapshot[]>;
}

export class InMemoryEngineeringWorkspaceStore implements EngineeringWorkspaceStore{
  private readonly snapshots=new Map<string,EngineeringWorkspaceSnapshot>();

  get(workspaceId:string):EngineeringWorkspaceSnapshot|undefined{
    const snapshot=this.snapshots.get(workspaceId);
    return snapshot?structuredClone(snapshot):undefined;
  }

  save(workspace:EngineeringWorkspaceSnapshot,expectedRevision?:number):EngineeringWorkspaceSnapshot{
    validateEngineeringWorkspaceSnapshot(workspace);
    const current=this.snapshots.get(workspace.id);
    if(current){
      if(expectedRevision===undefined) throw new Error(`Workspace revision is required for update: ${workspace.id}.`);
      if(expectedRevision!==current.revision) throw new Error(`Workspace revision conflict: expected ${expectedRevision}, current ${current.revision}.`);
    }else if(expectedRevision!==undefined&&expectedRevision!==0){
      throw new Error(`Workspace does not exist at expected revision ${expectedRevision}: ${workspace.id}.`);
    }
    const next=structuredClone(workspace);
    next.revision=current?current.revision+1:1;
    next.savedAt=new Date().toISOString();
    validateEngineeringWorkspaceSnapshot(next);
    this.snapshots.set(next.id,structuredClone(next));
    return structuredClone(next);
  }

  delete(workspaceId:string):boolean{return this.snapshots.delete(workspaceId);}
  list():EngineeringWorkspaceSnapshot[]{return [...this.snapshots.values()].map(snapshot=>structuredClone(snapshot));}
}
