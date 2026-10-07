import {ProjectState} from "../core/types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";

export const ENGINEERING_WORKSPACE_SCHEMA_VERSION=1 as const;

export interface EngineeringWorkspaceSnapshot{
  schemaVersion:typeof ENGINEERING_WORKSPACE_SCHEMA_VERSION;
  id:string;
  name:string;
  project:ProjectState;
  taskGraph:EngineeringTaskGraph;
  productModelRevision?:number;
  artifactRegistryRevision?:number;
  revision:number;
  savedAt:string;
}
