import {ExecutionJob,ExecutionRequest,ExecutionResult,JobStatus} from "./types";
export interface ExecutionBackendAdapter{readonly id:string;canExecute(request:ExecutionRequest):boolean;execute(request:ExecutionRequest):Promise<ExecutionResult>;}
export interface ExecutionJobStore{save(job:ExecutionJob):Promise<void>|void;get(id:string):Promise<ExecutionJob|undefined>|ExecutionJob|undefined;}
export class InMemoryExecutionJobStore implements ExecutionJobStore{private jobs=new Map<string,ExecutionJob>();save(job:ExecutionJob){this.jobs.set(job.id,structuredClone(job));}get(id:string){return this.jobs.get(id);}}
export class ExecutionEngine{
 constructor(private readonly adapters:ExecutionBackendAdapter[],private readonly store:ExecutionJobStore=new InMemoryExecutionJobStore()){}
 async run(request:ExecutionRequest):Promise<ExecutionJob>{
  const createdAt=new Date().toISOString();
  const job:ExecutionJob={id:request.id,request,status:"QUEUED",createdAt,queuedAt:createdAt,artifactIds:[],evidenceIds:[]};await this.store.save(job);
  const adapter=this.adapters.find(a=>a.canExecute(request));
  if(!adapter){const failed={...job,status:"FAILED" as const,error:"No execution backend available.",finishedAt:new Date().toISOString()};await this.store.save(failed);return failed;}
  const startedAt=new Date().toISOString();const running={...job,status:"RUNNING" as const,startedAt};await this.store.save(running);
  try{const result=await adapter.execute(request);const status:JobStatus=result.success?"SUCCEEDED":"FAILED";const completedAt=new Date().toISOString();const done={...running,status,finishedAt:completedAt,result:result.outputs,artifactIds:result.artifactIds,evidenceIds:result.evidenceIds??[],error:result.success?undefined:result.warnings.join("; ")};await this.store.save(done);return done;}
  catch(error){const failed={...running,status:"FAILED" as const,finishedAt:new Date().toISOString(),error:String(error)};await this.store.save(failed);return failed;}
 }
 getJob(id:string){return this.store.get(id);}
}