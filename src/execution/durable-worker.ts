import {ExecutionEngine} from "./executor.js";
import {ExecutionJobClaim,JobHeartbeat} from "./supabase-job-store.js";
export interface DurableExecutionRuntimeStore{
 claimNext(workerId:string,leaseSeconds:number):Promise<ExecutionJobClaim|undefined>;
 heartbeat(claim:ExecutionJobClaim,leaseSeconds:number):Promise<JobHeartbeat>;
 finishClaim(claim:ExecutionJobClaim,attempt:Awaited<ReturnType<ExecutionEngine["executeClaimed"]>>):Promise<boolean>;
}
export interface DurableExecutionWorkerOptions{leaseSeconds?:number;heartbeatIntervalMs?:number;}
function abortError(message:string):Error{const error=new Error(message);error.name="AbortError";return error;}
function sleep(ms:number):Promise<void>{return new Promise(resolve=>setTimeout(resolve,ms));}

/** One durable worker iteration. Multiple processes coordinate through database leases. */
export class DurableExecutionWorker{
 private readonly leaseSeconds:number;
 private readonly heartbeatIntervalMs:number;
 constructor(private readonly store:DurableExecutionRuntimeStore,private readonly engine:ExecutionEngine,private readonly workerId:string,options:DurableExecutionWorkerOptions={}){
  this.leaseSeconds=options.leaseSeconds??45;
  this.heartbeatIntervalMs=options.heartbeatIntervalMs??10_000;
  if(!Number.isInteger(this.leaseSeconds)||this.leaseSeconds<5)throw new Error("Worker lease must be at least five seconds.");
  if(!Number.isInteger(this.heartbeatIntervalMs)||this.heartbeatIntervalMs<250||this.heartbeatIntervalMs>=this.leaseSeconds*1000)throw new Error("Heartbeat interval must be positive and shorter than the lease.");
  if(!workerId.trim()||workerId.length>128)throw new Error("Worker ID must contain 1-128 characters.");
 }
 async runOnce():Promise<boolean>{
  const claim=await this.store.claimNext(this.workerId,this.leaseSeconds);
  if(!claim)return false;
  const controller=new AbortController();
  let stopHeartbeat=false,leaseLost=false;
  const heartbeatTask=(async()=>{
   while(!stopHeartbeat){
    await sleep(this.heartbeatIntervalMs);
    if(stopHeartbeat)break;
    try{
     const pulse=await this.store.heartbeat(claim,this.leaseSeconds);
     if(!pulse.active){leaseLost=true;controller.abort(abortError("Execution lease was lost; this worker cannot commit a result."));break;}
     if(pulse.cancelRequested){controller.abort(abortError("Cancellation was requested for this execution."));break;}
    }catch{
     leaseLost=true;controller.abort(abortError("Worker lease could not be renewed; result will not be committed."));break;
    }
   }
  })();
  let attempt:Awaited<ReturnType<ExecutionEngine["executeClaimed"]>>;
  try{attempt=await this.engine.executeClaimed(claim.job,controller.signal);}
  catch(error){
   const now=new Date().toISOString(),message=(error instanceof Error?error.message:String(error)).slice(0,2000),status=controller.signal.aborted?"CANCELLED":"FAILED";
   attempt={retryable:true,job:{...claim.job,status,finishedAt:now,error:message,errorCode:"WORKER_EXECUTION_ERROR",attemptHistory:[...(claim.job.attemptHistory??[]),{attempt:claim.job.attempts??1,startedAt:claim.job.startedAt??now,finishedAt:now,status,error:message}]}};
  }finally{stopHeartbeat=true;await heartbeatTask;}
  if(leaseLost)return true;
  await this.store.finishClaim(claim,attempt);
  return true;
 }
}
