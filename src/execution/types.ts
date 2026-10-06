export type JobStatus="QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"|"CANCELLED";
export type ExecutionBackend="typescript-safe"|"python-worker"|"cad-worker"|"fea-worker";
export interface UnitValue{value:number;unit:string;}
export interface ExecutionRequest{id:string;capability:string;backend:ExecutionBackend;inputs:Record<string,unknown>;requestedOutputs:string[];timeoutMs:number;projectId?:string;correlationId?:string;}
export interface ExecutionJob{id:string;request:ExecutionRequest;status:JobStatus;createdAt:string;queuedAt?:string;startedAt?:string;finishedAt?:string;result?:Record<string,unknown>;error?:string;artifactIds:string[];evidenceIds:string[];provenance?:ExecutionProvenance;}
export interface ExecutionResult{success:boolean;outputs:Record<string,unknown>;warnings:string[];artifactIds:string[];evidenceIds?:string[];provider?:string;providerVersion?:string;executionId?:string;completedAt?:string;}
export interface ExecutionProvenance{executionId:string;requestId:string;capability:string;backend:ExecutionBackend;provider?:string;providerVersion?:string;startedAt?:string;completedAt?:string;inputDigest?:string;outputDigest?:string;evidenceIds:string[];}
