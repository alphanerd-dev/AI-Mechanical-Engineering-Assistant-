import {ExecutionRequest,ExecutionResult} from "./types.js";
export interface WorkerSubmitResponse{accepted:boolean;jobId:string;status:"QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"|"CANCELLED"|"REJECTED";error?:string;}
export interface WorkerStatusResponse{jobId:string;status:"QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"|"CANCELLED";result?:ExecutionResult;error?:string;}
export class RetryableWorkerError extends Error{constructor(message:string){super(message);this.name="RetryableWorkerError";}}
export interface ExecutionWorkerService{
 submit(request:ExecutionRequest,signal?:AbortSignal):Promise<WorkerSubmitResponse>;
 status(jobId:string,signal?:AbortSignal):Promise<WorkerStatusResponse>;
 cancel?(jobId:string,signal?:AbortSignal):Promise<void>;
}
export class HttpExecutionWorkerService implements ExecutionWorkerService{
 constructor(private readonly baseUrl:string,private readonly fetchImpl:typeof fetch=fetch,private readonly apiToken?:string){}
 private headers(){return {"content-type":"application/json",...(this.apiToken?{"authorization":`Bearer ${this.apiToken}`}:{})};}
 async submit(request:ExecutionRequest,signal?:AbortSignal):Promise<WorkerSubmitResponse>{
  const response=await this.fetchImpl(new URL("/v1/jobs",this.baseUrl),{method:"POST",headers:this.headers(),body:JSON.stringify(request),signal});
  const body=await response.json() as WorkerSubmitResponse;
  if(response.status>=500)throw new RetryableWorkerError(`Worker submit returned HTTP ${response.status}.`);
  if(!response.ok)return {...body,accepted:false,status:"REJECTED",error:body.error??`Worker returned HTTP ${response.status}`};
  return body;
 }
 async status(jobId:string,signal?:AbortSignal):Promise<WorkerStatusResponse>{
  const response=await this.fetchImpl(new URL(`/v1/jobs/${encodeURIComponent(jobId)}`,this.baseUrl),{headers:this.headers(),signal});
  const body=await response.json() as WorkerStatusResponse;
  if(response.status===404||response.status>=500)throw new RetryableWorkerError(body.error??`Worker status returned HTTP ${response.status}.`);
  if(!response.ok)throw new Error(body.error??`Worker returned HTTP ${response.status}`);
  return body;
 }
 async cancel(jobId:string,signal?:AbortSignal):Promise<void>{
  const response=await this.fetchImpl(new URL(`/v1/jobs/${encodeURIComponent(jobId)}`,this.baseUrl),{method:"DELETE",headers:this.headers(),signal});
  if(!response.ok&&response.status!==404)throw new Error(`Worker cancellation returned HTTP ${response.status}.`);
 }
}
