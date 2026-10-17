import {ExecutionRequest,ExecutionResult} from "./types.js";
import {HttpExecutionWorkerService} from "./worker-service.js";
import {PythonWorkerClient} from "./python-worker.js";
export interface HttpPythonWorkerOptions{pollIntervalMs?:number;maxPolls?:number;}
function sleep(ms:number,signal?:AbortSignal):Promise<void>{
 if(signal?.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(done,ms);
  function done(){signal?.removeEventListener("abort",abort);resolve();}
  function abort(){clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(signal?.reason??new Error("Execution cancelled."));}
  signal?.addEventListener("abort",abort,{once:true});
 });
}
export class HttpPythonWorkerClient implements PythonWorkerClient{
 private readonly service:HttpExecutionWorkerService;
 private readonly pollIntervalMs:number;
 private readonly maxPolls:number;
 constructor(baseUrl:string,fetchImpl:typeof fetch=fetch,apiToken?:string,options:HttpPythonWorkerOptions={}){
  this.service=new HttpExecutionWorkerService(baseUrl,fetchImpl,apiToken);
  this.pollIntervalMs=options.pollIntervalMs??100;
  this.maxPolls=options.maxPolls??100;
 }
 async run(request:ExecutionRequest,signal?:AbortSignal):Promise<ExecutionResult>{
  const accepted=await this.service.submit(request,signal);
  if(!accepted.accepted)return {success:false,outputs:{},warnings:[accepted.error??"Worker rejected execution request."],artifactIds:[]};
  const cancelRemote=()=>{void this.service.cancel(accepted.jobId).catch(()=>undefined);};
  signal?.addEventListener("abort",cancelRemote,{once:true});
  try{
   for(let attempt=0;attempt<=this.maxPolls;attempt++){
    if(signal?.aborted)throw signal.reason;
    const status=await this.service.status(accepted.jobId,signal);
    if(status.status==="SUCCEEDED")return status.result??{success:false,outputs:{},warnings:["Worker reported success without a result."],artifactIds:[]};
    if(status.status==="FAILED"||status.status==="CANCELLED")return {success:false,outputs:{},warnings:[status.error??(`Worker job ${status.status.toLowerCase()}.`)],artifactIds:[]};
    if(attempt<this.maxPolls)await sleep(this.pollIntervalMs,signal);
   }
   const error=new Error("Worker polling limit exceeded before execution completed.");
   error.name="TimeoutError";
   throw error;
  }finally{signal?.removeEventListener("abort",cancelRemote);}
 }
}
