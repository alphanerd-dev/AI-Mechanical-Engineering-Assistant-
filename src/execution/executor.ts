import {createHash} from "node:crypto";
import {ExecutionJob,ExecutionRequest,ExecutionResult,JobStatus,ExecutionProvenance} from "./types";

function digest(value:unknown):string{
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface ExecutionBackendAdapter{readonly id:string;canExecute(request:ExecutionRequest):boolean;execute(request:ExecutionRequest):Promise<ExecutionResult>;}
export interface ExecutionJobStore{save(job:ExecutionJob):Promise<void>|void;get(id:string):Promise<ExecutionJob|undefined>|ExecutionJob|undefined;}
export class InMemoryExecutionJobStore implements ExecutionJobStore{private jobs=new Map<string,ExecutionJob>();save(job:ExecutionJob){this.jobs.set(job.id,structuredClone(job));}get(id:string){return this.jobs.get(id);}}

export class ExecutionEngine{
 constructor(private readonly adapters:ExecutionBackendAdapter[],private readonly store:ExecutionJobStore=new InMemoryExecutionJobStore()){}
 async run(request:ExecutionRequest):Promise<ExecutionJob>{
  const createdAt=new Date().toISOString();
  const job:ExecutionJob={id:request.id,request,status:"QUEUED",createdAt,queuedAt:createdAt,artifactIds:[],evidenceIds:[]};
  await this.store.save(job);
  const adapter=this.adapters.find(a=>a.canExecute(request));
  if(!adapter){
   const finishedAt=new Date().toISOString();
   const provenance:ExecutionProvenance={executionId:request.id,requestId:request.id,capability:request.capability,backend:request.backend,startedAt:createdAt,completedAt:finishedAt,inputDigest:digest(request.inputs),evidenceIds:[]};
   const failed={...job,status:"FAILED" as const,error:"No execution backend available.",finishedAt,provenance};
   await this.store.save(failed);return failed;
  }
  const startedAt=new Date().toISOString();
  const running={...job,status:"RUNNING" as const,startedAt};
  await this.store.save(running);
  try{
   const result=await adapter.execute(request);
   const status:JobStatus=result.success?"SUCCEEDED":"FAILED";
   const completedAt=result.completedAt??new Date().toISOString();
   const executionId=result.executionId??request.id;
   const provenance:ExecutionProvenance={
    executionId,requestId:request.id,capability:request.capability,backend:request.backend,
    provider:result.provider??adapter.id,providerVersion:result.providerVersion,
    startedAt,completedAt,inputDigest:digest(request.inputs),outputDigest:digest(result.outputs),
    evidenceIds:result.evidenceIds??[]
   };
   const done={...running,status,finishedAt:completedAt,result:result.outputs,artifactIds:result.artifactIds,evidenceIds:result.evidenceIds??[],error:result.success?undefined:result.warnings.join("; "),provenance};
   await this.store.save(done);return done;
  }catch(error){
   const finishedAt=new Date().toISOString();
   const provenance:ExecutionProvenance={executionId:request.id,requestId:request.id,capability:request.capability,backend:request.backend,provider:adapter.id,startedAt,completedAt:finishedAt,inputDigest:digest(request.inputs),evidenceIds:[]};
   const failed={...running,status:"FAILED" as const,finishedAt,error:String(error),provenance};
   await this.store.save(failed);return failed;
  }
 }
 getJob(id:string){return this.store.get(id);}
}
