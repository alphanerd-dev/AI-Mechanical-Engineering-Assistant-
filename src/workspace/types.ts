import {ProjectState} from "../core/types.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import type {CalculationArtifact} from "../artifacts/calculation-artifact.js";
import type {ShaftDesignWorkspaceState} from "./shaft-design-state.js";

export const ENGINEERING_WORKSPACE_SCHEMA_VERSION=1 as const;

export interface EngineeringWorkspaceSnapshot{
  schemaVersion:typeof ENGINEERING_WORKSPACE_SCHEMA_VERSION;
  id:string;
  name:string;
  project:ProjectState;
  taskGraph:EngineeringTaskGraph;
  /** Older persisted snapshots may omit artifacts; new snapshots initialize an empty registry. */
  artifacts?:CalculationArtifact[];
  /** Latest deterministic shaft design state; immutable calculation artifacts retain prior revisions. */
  shaftDesign?:ShaftDesignWorkspaceState;
  productModelRevision?:number;
  artifactRegistryRevision?:number;
  revision:number;
  savedAt:string;
}
