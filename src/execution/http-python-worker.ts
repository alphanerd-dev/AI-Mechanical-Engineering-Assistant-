import {ExecutionRequest,ExecutionResult} from "./types.js";
import {HttpExecutionWorkerService} from "./worker-service.js";
import {PythonWorkerClient} from "./python-worker.js";

export interface HttpPythonWorkerOptions { pollIntervalMs?:number; maxPolls?:number; }

export class HttpPythonWorkerClient implements PythonWorkerClient {
  private readonly service:HttpExecutionWorkerService;
  private readonly pollIntervalMs:number;
  private readonly maxPolls:number;

  constructor(baseUrl:string, fetchImpl:typeof fetch=fetch, apiToken?:string, options:HttpPythonWorkerOptions={}){
    this.service=new HttpExecutionWorkerService(baseUrl,fetchImpl,apiToken);
    this.pollIntervalMs=options.pollIntervalMs??100;
    this.maxPolls=options.maxPolls??100;
  }

  async run(request:ExecutionRequest):Promise<ExecutionResult>{
    const accepted=await this.service.submit(request);
    if(!accepted.accepted) return {success:false,outputs:{},warnings:[accepted.error??"Worker rejected execution request."],artifactIds:[]};
    for(let attempt=0;attempt<=this.maxPolls;attempt++){
      const status=await this.service.status(accepted.jobId);
      if(status.status==="SUCCEEDED") return status.result??{success:false,outputs:{},warnings:["Worker reported success without a result."],artifactIds:[]};
      if(status.status==="FAILED"||status.status==="CANCELLED") return {success:false,outputs:{},warnings:[status.error??("Worker job "+status.status.toLowerCase()+"." )],artifactIds:[]};
      if(attempt<this.maxPolls) await new Promise(resolve=>setTimeout(resolve,this.pollIntervalMs));
    }
    return {success:false,outputs:{},warnings:["Worker polling limit exceeded before execution completed."],artifactIds:[]};
  }
}
