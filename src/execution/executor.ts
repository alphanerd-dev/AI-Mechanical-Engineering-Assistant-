import {createHash} from "node:crypto";
import {ExecutionJob,ExecutionRequest,ExecutionResult,JobStatus,ExecutionProvenance,ExecutionAttemptHistoryRecord} from "./types.js";
function digest(value:unknown):string{return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function abortReason(signal:AbortSignal):Error{return signal.reason instanceof Error?signal.reason:new Error("Execution was aborted.");}
function errorName(error:unknown):string{return error!==null&&typeof error==="object"&&"name" in error&&typeof error.name==="string"?error.name:"Error";}
function errorMessage(error:unknown):string{return (error instanceof Error?error.message:String(error)).slice(0,2000);}
export interface ExecutionBackendAdapter{readonly id:string;readonly retrySafe?:boolean;canExecute(request:ExecutionRequest):boolean;execute(request:ExecutionRequest,signal?:AbortSignal):Promise<ExecutionResult>;}
export interface ExecutionJobStore{save(job:ExecutionJob):Promise<void>|void;get(id:string):Promise<ExecutionJob|undefined>|ExecutionJob|undefined;}
export interface ExecutionAttempt{job:ExecutionJob;retryable:boolean;}
export class InMemoryExecutionJobStore implements ExecutionJobStore{
 private jobs=new Map<string,ExecutionJob>();
 save(job:ExecutionJob){this.jobs.set(job.id,structuredClone(job));}
 get(id:string){const job=this.jobs.get(id);return job?structuredClone(job):undefined;}
}
/** The in-memory run() path remains useful for deterministic tests; production uses durable claimed jobs. */
export class ExecutionEngine{
 constructor(private readonly adapters:ExecutionBackendAdapter[],private readonly store:ExecutionJobStore=new InMemoryExecutionJobStore()){}
 async run(request:ExecutionRequest):Promise<ExecutionJob>{
  const createdAt=new Date().toISOString();
  const job:ExecutionJob={id:request.id,request,status:"QUEUED",createdAt,queuedAt:createdAt,attempts:0,maxAttempts:1,artifactIds:[],evidenceIds:[],attemptHistory:[]};
  await this.store.save(job);
  const running={...job,status:"RUNNING" as const,startedAt:new Date().toISOString(),attempts:1};
  await this.store.save(running);
  const attempt=await this.executeClaimed(running);
  await this.store.save(attempt.job);
  return attempt.job;
 }
 async executeClaimed(job:ExecutionJob,outerSignal?:AbortSignal):Promise<ExecutionAttempt>{
  const request=job.request,adapter=this.adapters.find(candidate=>candidate.canExecute(request)),startedAt=job.startedAt??new Date().toISOString();
  if(!adapter){
   const finishedAt=new Date().toISOString(),message="No eligible execution backend is available for this request.";
   const history:ExecutionAttemptHistoryRecord={attempt:job.attempts??1,startedAt,finishedAt,status:"FAILED",error:message};
   return {retryable:false,job:{...job,status:"FAILED",startedAt,finishedAt,error:message,errorCode:"NO_EXECUTION_BACKEND",attemptHistory:[...(job.attemptHistory??[]),history],provenance:{executionId:request.id,requestId:request.id,capability:request.capability,backend:request.backend,startedAt,completedAt:finishedAt,inputDigest:digest(request.inputs),evidenceIds:[]}}};
  }
  const controller=new AbortController();
  let timedOut=false;
  const forwardAbort=()=>controller.abort(outerSignal?.reason??new Error("Execution cancelled."));
  if(outerSignal?.aborted)forwardAbort();else outerSignal?.addEventListener("abort",forwardAbort,{once:true});
  const timeout=setTimeout(()=>{
   timedOut=true;const error=new Error(`Execution exceeded its ${request.timeoutMs} ms time limit.`);error.name="TimeoutError";controller.abort(error);
  },Math.max(1,request.timeoutMs));
  const abortPromise=new Promise<never>((_,reject)=>{
   if(controller.signal.aborted){reject(abortReason(controller.signal));return;}
   controller.signal.addEventListener("abort",()=>reject(abortReason(controller.signal)),{once:true});
  });
  try{
   const result=await Promise.race([adapter.execute(request,controller.signal),abortPromise]),finishedAt=result.completedAt??new Date().toISOString();
   const status:JobStatus=result.success?"SUCCEEDED":"FAILED",error=result.success?undefined:(result.warnings.join("; ").slice(0,2000)||"Execution provider reported failure.");
   const history:ExecutionAttemptHistoryRecord={attempt:job.attempts??1,startedAt,finishedAt,status,provider:result.provider??adapter.id,error};
   const provenance:ExecutionProvenance={executionId:result.executionId??request.id,requestId:request.id,capability:request.capability,backend:request.backend,provider:result.provider??adapter.id,providerVersion:result.providerVersion,startedAt,completedAt:finishedAt,inputDigest:digest(request.inputs),outputDigest:digest(result.outputs),evidenceIds:result.evidenceIds??[]};
   return {retryable:false,job:{...job,status,startedAt,finishedAt,result:result.outputs,artifactIds:result.artifactIds,evidenceIds:result.evidenceIds??[],error,errorCode:result.success?undefined:"PROVIDER_REJECTED",provenance,attemptHistory:[...(job.attemptHistory??[]),history]}};
  }catch(error){
   const cancelled=Boolean(outerSignal?.aborted),finishedAt=new Date().toISOString(),message=errorMessage(error),status:JobStatus=cancelled?"CANCELLED":"FAILED";
   const history:ExecutionAttemptHistoryRecord={attempt:job.attempts??1,startedAt,finishedAt,status,provider:adapter.id,error:message};
   const provenance:ExecutionProvenance={executionId:request.id,requestId:request.id,capability:request.capability,backend:request.backend,provider:adapter.id,startedAt,completedAt:finishedAt,inputDigest:digest(request.inputs),evidenceIds:[]};
   const retryable=!cancelled&&adapter.retrySafe===true&&(timedOut||errorName(error)==="TimeoutError"||errorName(error)==="TypeError"||errorName(error)==="RetryableWorkerError");
   return {retryable,job:{...job,status,startedAt,finishedAt,error:message,errorCode:cancelled?"CANCELLED":timedOut||errorName(error)==="TimeoutError"?"EXECUTION_TIMEOUT":"EXECUTION_ERROR",provenance,attemptHistory:[...(job.attemptHistory??[]),history]}};
  }finally{clearTimeout(timeout);outerSignal?.removeEventListener("abort",forwardAbort);}
 }
 async getJob(id:string):Promise<ExecutionJob|undefined>{return this.store.get(id);}
}
