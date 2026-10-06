import {CADExecutionResult} from "./execution.js";
import {CADArtifact,CADArtifactKind} from "./artifacts.js";

export interface CADArtifactManifest {
  artifacts:CADArtifact[];
  warnings:string[];
}

function artifact(
  projectId:string,
  execution:CADExecutionResult,
  kind:CADArtifactKind,
  path:string|undefined,
  now:string
):CADArtifact|undefined {
  if(!path) return undefined;
  return {
    id:`${projectId}-cad-${kind.toLowerCase()}-${Date.now()}`,
    kind,
    name:path.split("/").pop() ?? `CAD ${kind}`,
    uri:path,
    backend:execution.backend,
    validationStatus:"UNVALIDATED",
    informationStatus:"CALCULATED",
    evidenceIds:[],
    createdAt:now
  };
}

export function normalizeCADExecutionResult(
  projectId:string,
  execution:CADExecutionResult
):CADArtifactManifest {
  const now=new Date().toISOString();
  const paths:Array<[CADArtifactKind,string|undefined]>=[
    ["SOURCE",execution.sourceArtifactPath],
    ["SOLID",execution.solidArtifactPath],
    ["STEP",execution.stepArtifactPath],
    ["STL",execution.stlArtifactPath],
    ["THREE_MF",execution.threeMfArtifactPath]
  ];
  const artifacts=paths
    .map(([kind,path])=>artifact(projectId,execution,kind,path,now))
    .filter((value):value is CADArtifact=>value!==undefined);
  return {artifacts,warnings:[...execution.warnings]};
}
