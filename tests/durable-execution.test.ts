import {describe,it,expect,vi} from "vitest";
import {ExecutionEngine,ExecutionBackendAdapter} from "../src/execution/executor.js";
import {DurableExecutionWorker} from "../src/execution/durable-worker.js";
import {ExecutionJob} from "../src/execution/types.js";
import {ExecutionJobClaim} from "../src/execution/supabase-job-store.js";
import {createExecutionRequestDigest} from "../src/execution/supabase-job-store.js";
import {ExecutionRequest} from "../src/execution/types.js";
function job(overrides:Partial<ExecutionJob>={}):ExecutionJob{
 const request={id:"10000000-0000-4000-8000-000000000001",capability:"TEST.IDEMPOTENT",backend:"typescript-safe" as const,inputs:{value:4},requestedOutputs:["value"],timeoutMs:1000,projectId:"20000000-0000-4000-8000-000000000001"};
 return {id:request.id,request,status:"RUNNING",createdAt:new Date(0).toISOString(),queuedAt:new Date(0).toISOString(),startedAt:new Date(0).toISOString(),attempts:1,maxAttempts:3,artifactIds:[],evidenceIds:[],attemptHistory:[],...overrides};
}
function claim(value=job()):ExecutionJobClaim{return {job:value,workerId:"worker-test",leaseToken:"30000000-0000-4000-8000-000000000001"};}

describe("durable execution attempt handling",()=>{
 it("bounds execution time and marks retry-safe timeouts retryable",async()=>{
  const adapter:ExecutionBackendAdapter={id:"retry-safe-test",retrySafe:true,canExecute:()=>true,execute:async(_request,signal)=>new Promise((_resolve,reject)=>signal?.addEventListener("abort",()=>reject(signal.reason),{once:true}))};
  const initial=job({request:{...job().request,timeoutMs:5}});
  const attempt=await new ExecutionEngine([adapter]).executeClaimed(initial);
  expect(attempt.job.status).toBe("FAILED");expect(attempt.job.errorCode).toBe("EXECUTION_TIMEOUT");expect(attempt.retryable).toBe(true);expect(attempt.job.attemptHistory).toHaveLength(1);
 });
 it("does not automatically retry a provider-declared failure",async()=>{
  const adapter:ExecutionBackendAdapter={id:"test",retrySafe:true,canExecute:()=>true,execute:async()=>({success:false,outputs:{},warnings:["invalid engineering input"],artifactIds:[]})};
  const attempt=await new ExecutionEngine([adapter]).executeClaimed(job());
  expect(attempt.job.status).toBe("FAILED");expect(attempt.retryable).toBe(false);
 });
});

describe("durable worker lease lifecycle",()=>{
 it("claims, executes, and commits a job once",async()=>{
  const current=claim(),store={claimNext:vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(undefined),heartbeat:vi.fn().mockResolvedValue({active:true,cancelRequested:false}),finishClaim:vi.fn().mockResolvedValue(true)};
  const adapter:ExecutionBackendAdapter={id:"test",retrySafe:true,canExecute:()=>true,execute:async()=>({success:true,outputs:{value:4},warnings:[],artifactIds:[]})};
  const worker=new DurableExecutionWorker(store,new ExecutionEngine([adapter]),"worker-test",{leaseSeconds:5,heartbeatIntervalMs:250});
  await expect(worker.runOnce()).resolves.toBe(true);
  expect(store.claimNext).toHaveBeenCalledTimes(1);expect(store.finishClaim).toHaveBeenCalledTimes(1);expect(store.finishClaim.mock.calls[0][0]).toBe(current);expect(store.finishClaim.mock.calls[0][1].job.status).toBe("SUCCEEDED");
 });
 it("does not commit a result after losing its lease",async()=>{
  const current=claim(),store={claimNext:vi.fn().mockResolvedValue(current),heartbeat:vi.fn().mockResolvedValue({active:false,cancelRequested:false}),finishClaim:vi.fn().mockResolvedValue(true)};
  const adapter:ExecutionBackendAdapter={id:"test",retrySafe:true,canExecute:()=>true,execute:async(_request,signal)=>new Promise((_resolve,reject)=>signal?.addEventListener("abort",()=>reject(signal.reason),{once:true}))};
  const worker=new DurableExecutionWorker(store,new ExecutionEngine([adapter]),"worker-test",{leaseSeconds:5,heartbeatIntervalMs:250});
  await worker.runOnce();expect(store.finishClaim).not.toHaveBeenCalled();
 });
 it("commits cancellation instead of a late success",async()=>{
  const current=claim(),store={claimNext:vi.fn().mockResolvedValue(current),heartbeat:vi.fn().mockResolvedValue({active:true,cancelRequested:true}),finishClaim:vi.fn().mockResolvedValue(true)};
  const adapter:ExecutionBackendAdapter={id:"test",retrySafe:true,canExecute:()=>true,execute:async(_request,signal)=>new Promise((_resolve,reject)=>signal?.addEventListener("abort",()=>reject(signal.reason),{once:true}))};
  const worker=new DurableExecutionWorker(store,new ExecutionEngine([adapter]),"worker-test",{leaseSeconds:5,heartbeatIntervalMs:250});
  await worker.runOnce();expect(store.finishClaim).toHaveBeenCalledTimes(1);expect(store.finishClaim.mock.calls[0][1].job.status).toBe("CANCELLED");
 });
});


describe("canonical execution request digest",()=>{
 it("ignores generated IDs and JSON object-key insertion order",()=>{
  const first:ExecutionRequest={
   id:"10000000-0000-4000-8000-000000000001",
   correlationId:"request-correlation-a",
   capability:"UNITS.CONVERT",
   backend:"python-worker",
   inputs:{value:5,fromUnit:"m",toUnit:"mm"},
   requestedOutputs:["value"],
   timeoutMs:30000,
   projectId:"20000000-0000-4000-8000-000000000001"
  };
  const replay:ExecutionRequest={
   projectId:first.projectId,
   timeoutMs:first.timeoutMs,
   requestedOutputs:["value"],
   inputs:{toUnit:"mm",fromUnit:"m",value:5},
   backend:"python-worker",
   capability:"UNITS.CONVERT",
   correlationId:"request-correlation-b",
   id:"10000000-0000-4000-8000-000000000002"
  };
  expect(createExecutionRequestDigest(first)).toBe(createExecutionRequestDigest(replay));
 });

 it("changes when an engineering input changes",()=>{
  const request:ExecutionRequest={
   id:"10000000-0000-4000-8000-000000000001",
   capability:"ANALYSIS.SHAFT_TORQUE",
   backend:"typescript-safe",
   inputs:{powerKw:5,speedRpm:1500},
   requestedOutputs:["torqueNm"],
   timeoutMs:2000,
   projectId:"20000000-0000-4000-8000-000000000001"
  };
  expect(createExecutionRequestDigest({...request,inputs:{powerKw:6,speedRpm:1500}})).not.toBe(createExecutionRequestDigest(request));
 });
});
