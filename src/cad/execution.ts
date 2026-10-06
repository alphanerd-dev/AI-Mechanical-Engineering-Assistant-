export type CADExecutionBackend='build123d'|'cadquery';

export interface CADExecutionRequest {
  id:string; backend:CADExecutionBackend; source:string; filename:string;
  parameters?:Record<string,unknown>; timeoutMs:number;
}

export interface CADExecutionResult {
  success:boolean; backend:CADExecutionBackend;
  sourceArtifactPath?:string; solidArtifactPath?:string; stepArtifactPath?:string;
  stlArtifactPath?:string; threeMfArtifactPath?:string;
  stdout?:string; stderr?:string; warnings:string[]; error?:string;
}

export interface CADWorkerExecutor {
  execute(request:CADExecutionRequest):Promise<CADExecutionResult>;
}