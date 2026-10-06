import {ExecutionRequest,ExecutionResult} from "./types.js";

export interface WorkerSubmitResponse {
  accepted:boolean;
  jobId:string;
  status:"QUEUED"|"REJECTED";
  error?:string;
}

export interface WorkerStatusResponse {
  jobId:string;
  status:"QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"|"CANCELLED";
  result?:ExecutionResult;
  error?:string;
}

/** Transport-neutral contract for an isolated execution service. */
export interface ExecutionWorkerService {
  submit(request:ExecutionRequest):Promise<WorkerSubmitResponse>;
  status(jobId:string):Promise<WorkerStatusResponse>;
  cancel?(jobId:string):Promise<void>;
}

/** HTTP adapter for a separately deployed worker service. */
export class HttpExecutionWorkerService implements ExecutionWorkerService {
  constructor(private readonly baseUrl:string,private readonly fetchImpl:typeof fetch=fetch){}

  async submit(request:ExecutionRequest):Promise<WorkerSubmitResponse>{
    const response=await this.fetchImpl(new URL("/v1/jobs",this.baseUrl),{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(request)
    });
    const body=await response.json() as WorkerSubmitResponse;
    if(!response.ok) return {...body,accepted:false,status:"REJECTED",error:body.error??`Worker returned HTTP ${response.status}`};
    return body;
  }

  async status(jobId:string):Promise<WorkerStatusResponse>{
    const response=await this.fetchImpl(new URL(`/v1/jobs/${encodeURIComponent(jobId)}`,this.baseUrl));
    const body=await response.json() as WorkerStatusResponse;
    if(!response.ok) throw new Error(body.error??`Worker returned HTTP ${response.status}`);
    return body;
  }
}
