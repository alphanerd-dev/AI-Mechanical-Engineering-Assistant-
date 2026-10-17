import {createHash,randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {ExecutionAttempt} from "./executor.js";
import type {ExecutionJob,ExecutionRequest} from "./types.js";
const TABLE="engineering_execution_jobs";
const JOB_STATUSES=["QUEUED","RUNNING","SUCCEEDED","FAILED","CANCELLED"] as const;
export const DEFAULT_EXECUTION_MAX_ATTEMPTS=3;
export class IdempotencyConflictError extends Error{constructor(){super("This Idempotency-Key was already used with a different execution request.");this.name="IdempotencyConflictError";}}
export class ExecutionJobStoreError extends Error{constructor(operation:string){super(`Durable execution job storage failed during ${operation}.`);this.name="ExecutionJobStoreError";}}
export interface SubmitExecutionJobInput{request:ExecutionRequest;ownerId:string;idempotencyKey:string;maxAttempts?:number;}
export interface SubmitExecutionJobResult{job:ExecutionJob;created:boolean;}
export interface ExecutionJobClaim{job:ExecutionJob;workerId:string;leaseToken:string;}
export interface JobHeartbeat{active:boolean;cancelRequested:boolean;}
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
 return value;
}
function requestDigest(request:ExecutionRequest):string{
 const body:Record<string,unknown>={...request};
 delete body.id;
 delete body.correlationId;
 return createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
}
function record(value:unknown):Record<string,unknown>|undefined{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}
function stringOrUndefined(value:unknown):string|undefined{return typeof value==="string"?value:undefined;}
function stringArray(value:unknown):string[]{return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];}
function historyArray(value:unknown):NonNullable<ExecutionJob["attemptHistory"]>{
 return Array.isArray(value)?value.filter(item=>{const candidate=record(item);return candidate&&typeof candidate.attempt==="number"&&typeof candidate.startedAt==="string"&&typeof candidate.finishedAt==="string"&&typeof candidate.status==="string";}) as NonNullable<ExecutionJob["attemptHistory"]>:[];
}
function toJob(value:unknown):ExecutionJob{
 const row=record(value);
 if(!row||typeof row.id!=="string"||typeof row.status!=="string"||!JOB_STATUSES.includes(row.status as typeof JOB_STATUSES[number])||!record(row.request))throw new ExecutionJobStoreError("reading or validating a job record");
 const request=row.request as unknown as ExecutionRequest;
 if(typeof request.capability!=="string"||typeof request.backend!=="string"||!record(request.inputs)||typeof request.timeoutMs!=="number")throw new ExecutionJobStoreError("validating a stored request");
 const result=record(row.result),provenance=record(row.provenance);
 return {
  id:row.id,request:{...request,id:row.id,projectId:stringOrUndefined(row.project_id)},status:row.status as ExecutionJob["status"],
  createdAt:stringOrUndefined(row.created_at)??new Date(0).toISOString(),queuedAt:stringOrUndefined(row.queued_at),startedAt:stringOrUndefined(row.started_at),finishedAt:stringOrUndefined(row.finished_at),
  attempts:typeof row.attempts==="number"?row.attempts:0,maxAttempts:typeof row.max_attempts==="number"?row.max_attempts:DEFAULT_EXECUTION_MAX_ATTEMPTS,
  nextAttemptAt:stringOrUndefined(row.next_attempt_at),cancelRequestedAt:stringOrUndefined(row.cancel_requested_at),result:result as Record<string,unknown>|undefined,
  error:stringOrUndefined(row.error),errorCode:stringOrUndefined(row.error_code),artifactIds:stringArray(row.artifact_ids),evidenceIds:stringArray(row.evidence_ids),
  provenance:provenance as unknown as ExecutionJob["provenance"],attemptHistory:historyArray(row.attempt_history)
 };
}
function isUniqueViolation(error:unknown):boolean{return record(error)?.code==="23505";}

export class SupabaseExecutionJobStore{
 constructor(private readonly client:SupabaseClient){}
 async submit(input:SubmitExecutionJobInput):Promise<SubmitExecutionJobResult>{
  const requestHash=requestDigest(input.request),now=new Date().toISOString();
  const row={id:input.request.id||randomUUID(),owner_id:input.ownerId,project_id:input.request.projectId,idempotency_key:input.idempotencyKey,request_hash:requestHash,capability:input.request.capability,backend:input.request.backend,request:input.request,status:"QUEUED",attempts:0,max_attempts:input.maxAttempts??DEFAULT_EXECUTION_MAX_ATTEMPTS,next_attempt_at:now,queued_at:now,artifact_ids:[],evidence_ids:[],attempt_history:[]};
  const {data,error}=await this.client.from(TABLE).insert(row).select("*").single();
  if(!error&&data)return {job:toJob(data),created:true};
  if(isUniqueViolation(error)){
   const existing=await this.client.from(TABLE).select("*").eq("owner_id",input.ownerId).eq("project_id",input.request.projectId).eq("idempotency_key",input.idempotencyKey).maybeSingle();
   if(existing.error||!existing.data)throw new ExecutionJobStoreError("resolving an idempotent submission");
   if(existing.data.request_hash!==requestHash)throw new IdempotencyConflictError();
   return {job:toJob(existing.data),created:false};
  }
  throw new ExecutionJobStoreError("submitting a job");
 }
 async getForProject(id:string,projectId:string):Promise<ExecutionJob|undefined>{
  const {data,error}=await this.client.from(TABLE).select("*").eq("id",id).eq("project_id",projectId).maybeSingle();
  if(error)throw new ExecutionJobStoreError("reading a job");
  return data?toJob(data):undefined;
 }
 async requestCancellation(id:string,projectId:string):Promise<ExecutionJob|undefined>{
  // Retry the read/conditional-write cycle when a worker claims or completes the
  // job concurrently with the user's cancellation request.
  for(let attempt=0;attempt<3;attempt++){
   const current=await this.client.from(TABLE).select("*").eq("id",id).eq("project_id",projectId).maybeSingle();
   if(current.error)throw new ExecutionJobStoreError("reading a job for cancellation");
   if(!current.data)return undefined;
   const job=toJob(current.data);
   if(job.status!=="QUEUED"&&job.status!=="RUNNING")return job;
   const now=new Date().toISOString();
   if(job.status==="QUEUED"){
    const updated=await this.client.from(TABLE).update({status:"CANCELLED",cancel_requested_at:current.data.cancel_requested_at??now,finished_at:now,updated_at:now,error:"Cancelled before execution started.",error_code:"CANCELLED"}).eq("id",id).eq("project_id",projectId).eq("status","QUEUED").select("*").maybeSingle();
    if(updated.error)throw new ExecutionJobStoreError("cancelling a queued job");
    if(updated.data)return toJob(updated.data);
    continue;
   }
   if(current.data.cancel_requested_at)return job;
   const updated=await this.client.from(TABLE).update({cancel_requested_at:now,updated_at:now}).eq("id",id).eq("project_id",projectId).eq("status","RUNNING").is("cancel_requested_at",null).select("*").maybeSingle();
   if(updated.error)throw new ExecutionJobStoreError("requesting running-job cancellation");
   if(updated.data)return toJob(updated.data);
  }
  const latest=await this.client.from(TABLE).select("*").eq("id",id).eq("project_id",projectId).maybeSingle();
  if(latest.error)throw new ExecutionJobStoreError("re-reading a job after cancellation");
  return latest.data?toJob(latest.data):undefined;
 }
 async claimNext(workerId:string,leaseSeconds:number):Promise<ExecutionJobClaim|undefined>{
  const {data,error}=await this.client.rpc("claim_engineering_execution_job",{p_worker_id:workerId,p_lease_seconds:leaseSeconds});
  if(error)throw new ExecutionJobStoreError("claiming the next queued job");
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return undefined;
  const job=toJob(row),leaseToken=stringOrUndefined(record(row)?.lease_token);
  if(!leaseToken)throw new ExecutionJobStoreError("validating a worker lease");
  return {job,workerId,leaseToken};
 }
 async heartbeat(claim:ExecutionJobClaim,leaseSeconds:number):Promise<JobHeartbeat>{
  const current=await this.client.from(TABLE).select("cancel_requested_at").eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).maybeSingle();
  if(current.error)throw new ExecutionJobStoreError("reading worker lease state");
  if(!current.data)return {active:false,cancelRequested:false};
  const updated=await this.client.from(TABLE).update({lease_expires_at:new Date(Date.now()+leaseSeconds*1000).toISOString(),updated_at:new Date().toISOString()}).eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).select("id").maybeSingle();
  if(updated.error)throw new ExecutionJobStoreError("renewing a worker lease");
  return {active:Boolean(updated.data),cancelRequested:Boolean(current.data.cancel_requested_at)};
 }
 async finishClaim(claim:ExecutionJobClaim,attempt:ExecutionAttempt):Promise<boolean>{
  const current=await this.client.from(TABLE).select("cancel_requested_at,attempts,max_attempts").eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).maybeSingle();
  if(current.error)throw new ExecutionJobStoreError("checking a claim before completion");
  if(!current.data)return false;
  const now=new Date().toISOString(),wasCancelled=Boolean(current.data.cancel_requested_at)||attempt.job.status==="CANCELLED";
  if(wasCancelled){
   const history=[...(attempt.job.attemptHistory??[])];
   if(history.length)history[history.length-1]={...history[history.length-1],status:"CANCELLED",error:"Cancellation was requested before completion was committed."};
   const update=await this.client.from(TABLE).update({status:"CANCELLED",finished_at:now,updated_at:now,cancel_requested_at:current.data.cancel_requested_at??now,error:"Execution cancelled.",error_code:"CANCELLED",result:null,artifact_ids:[],evidence_ids:[],provenance:attempt.job.provenance??null,attempt_history:history,lease_owner:null,lease_token:null,lease_expires_at:null}).eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).select("id").maybeSingle();
   if(update.error)throw new ExecutionJobStoreError("persisting cancellation");
   return Boolean(update.data);
  }
  const attempts=Number(current.data.attempts??claim.job.attempts??1),maxAttempts=Number(current.data.max_attempts??claim.job.maxAttempts??DEFAULT_EXECUTION_MAX_ATTEMPTS);
  if(attempt.job.status==="FAILED"&&attempt.retryable&&attempts<maxAttempts){
   const delayMs=Math.min(30_000,1000*2**Math.max(0,Math.min(attempts-1,5)));
   const update=await this.client.from(TABLE).update({status:"QUEUED",result:null,error:attempt.job.error??"Retryable execution failure.",error_code:attempt.job.errorCode??"RETRYABLE_FAILURE",provenance:attempt.job.provenance??null,attempt_history:attempt.job.attemptHistory??[],next_attempt_at:new Date(Date.now()+delayMs).toISOString(),finished_at:null,updated_at:now,lease_owner:null,lease_token:null,lease_expires_at:null}).eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).is("cancel_requested_at",null).select("id").maybeSingle();
   if(update.error)throw new ExecutionJobStoreError("scheduling a retry");
   if(update.data)return true;
   const latest=await this.client.from(TABLE).select("cancel_requested_at").eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).maybeSingle();
   if(latest.error)throw new ExecutionJobStoreError("checking cancellation before retry");
   if(!latest.data)return false;
   if(latest.data.cancel_requested_at){
    const cancelled=await this.client.from(TABLE).update({status:"CANCELLED",finished_at:now,updated_at:now,error:"Execution cancelled.",error_code:"CANCELLED",result:null,artifact_ids:[],evidence_ids:[],attempt_history:attempt.job.attemptHistory??[],lease_owner:null,lease_token:null,lease_expires_at:null}).eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).select("id").maybeSingle();
    if(cancelled.error)throw new ExecutionJobStoreError("cancelling a retrying job");
    return Boolean(cancelled.data);
   }
   return false;
  }
  const status=attempt.job.status;
  const update=await this.client.from(TABLE).update({status,result:status==="SUCCEEDED"?attempt.job.result??{}:null,error:status==="SUCCEEDED"?null:attempt.job.error??"Execution failed.",error_code:status==="SUCCEEDED"?null:attempt.job.errorCode??"EXECUTION_FAILED",artifact_ids:status==="SUCCEEDED"?attempt.job.artifactIds:[],evidence_ids:status==="SUCCEEDED"?attempt.job.evidenceIds:[],provenance:attempt.job.provenance??null,attempt_history:attempt.job.attemptHistory??[],started_at:attempt.job.startedAt??claim.job.startedAt??now,finished_at:now,updated_at:now,lease_owner:null,lease_token:null,lease_expires_at:null}).eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).is("cancel_requested_at",null).select("id").maybeSingle();
  if(update.error)throw new ExecutionJobStoreError("persisting execution completion");
  if(update.data)return true;
  // A cancellation can arrive between the initial read and the terminal write.
  // Re-check the lease and let the cancellation win if it was recorded first.
  const latest=await this.client.from(TABLE).select("cancel_requested_at").eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).maybeSingle();
  if(latest.error)throw new ExecutionJobStoreError("checking a concurrent cancellation");
  if(!latest.data||!latest.data.cancel_requested_at)return false;
  const history=[...(attempt.job.attemptHistory??[])];
  if(history.length)history[history.length-1]={...history[history.length-1],status:"CANCELLED",error:"Cancellation was requested before completion was committed."};
  const cancelled=await this.client.from(TABLE).update({status:"CANCELLED",result:null,error:"Execution cancelled.",error_code:"CANCELLED",artifact_ids:[],evidence_ids:[],attempt_history:history,finished_at:now,updated_at:now,lease_owner:null,lease_token:null,lease_expires_at:null}).eq("id",claim.job.id).eq("status","RUNNING").eq("lease_owner",claim.workerId).eq("lease_token",claim.leaseToken).select("id").maybeSingle();
  if(cancelled.error)throw new ExecutionJobStoreError("finalizing a concurrent cancellation");
  return Boolean(cancelled.data);
 }
}
