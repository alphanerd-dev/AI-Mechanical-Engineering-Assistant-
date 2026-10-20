#!/usr/bin/env node
import {hostname} from "node:os";
import {createExecutionWorkerAdminClient} from "../src/execution/admin-client.js";
import {DurableExecutionWorker} from "../src/execution/durable-worker.js";
import {ExecutionBackendAdapter,ExecutionEngine} from "../src/execution/executor.js";
import {PythonWorkerAdapter} from "../src/execution/python-worker.js";
import {HttpPythonWorkerClient} from "../src/execution/http-python-worker.js";
import {SafeNumericalAdapter} from "../src/execution/safe-numerical.js";
import {SupabaseExecutionJobStore} from "../src/execution/supabase-job-store.js";
function boundedInteger(value:string|undefined,fallback:number,min:number,max:number):number{
 if(!value)return fallback;const parsed=Number(value);
 if(!Number.isInteger(parsed)||parsed<min||parsed>max)throw new Error(`Expected an integer environment value between ${min} and ${max}.`);
 return parsed;
}
const mode=process.env.EXECUTION_WORKER_MODE?.trim()||"continuous";
if(mode!=="continuous"&&mode!=="drain")throw new Error("EXECUTION_WORKER_MODE must be continuous or drain.");
const maxJobs=boundedInteger(process.env.EXECUTION_WORKER_MAX_JOBS,5,1,100);
const maxRunMs=boundedInteger(process.env.EXECUTION_WORKER_MAX_RUNTIME_MS,210_000,1_000,240_000);
const client=createExecutionWorkerAdminClient(),store=new SupabaseExecutionJobStore(client),adapters:ExecutionBackendAdapter[]=[new SafeNumericalAdapter()];
if(process.env.PYTHON_WORKER_URL){
 const token=process.env.PYTHON_WORKER_API_TOKEN?.trim();
 if(!token)throw new Error("PYTHON_WORKER_URL requires PYTHON_WORKER_API_TOKEN.");
 adapters.push(new PythonWorkerAdapter(new HttpPythonWorkerClient(
  process.env.PYTHON_WORKER_URL,
  fetch,
  token,
  {pollIntervalMs:boundedInteger(process.env.PYTHON_WORKER_POLL_INTERVAL_MS,250,25,5000),maxPolls:boundedInteger(process.env.PYTHON_WORKER_MAX_POLLS,120,1,1200)}
 )));
}
const engine=new ExecutionEngine(adapters),workerId=(process.env.EXECUTION_WORKER_ID?.trim()||`${hostname()}-${process.pid}`).slice(0,128);
const pollMs=boundedInteger(process.env.EXECUTION_WORKER_POLL_INTERVAL_MS,1000,100,30_000),leaseSeconds=boundedInteger(process.env.EXECUTION_WORKER_LEASE_SECONDS,45,5,300),heartbeatMs=boundedInteger(process.env.EXECUTION_WORKER_HEARTBEAT_MS,10_000,250,leaseSeconds*1000-1);
const worker=new DurableExecutionWorker(store,engine,workerId,{leaseSeconds,heartbeatIntervalMs:heartbeatMs});
let stopping=false;process.on("SIGINT",()=>{stopping=true;});process.on("SIGTERM",()=>{stopping=true;});
async function main(){
 console.log(JSON.stringify({event:"execution_worker_started",workerId,mode,pollMs,leaseSeconds,heartbeatMs,maxJobs,maxRunMs,configuredAdapters:adapters.map(adapter=>adapter.id)}));
 if(mode==="drain"){
  const startedAt=Date.now(),deadline=startedAt+maxRunMs;let processedJobs=0;
  while(!stopping&&processedJobs<maxJobs&&Date.now()<deadline){
   const processed=await worker.runOnce();
   if(!processed)break;
   processedJobs++;
  }
  console.log(JSON.stringify({event:"execution_worker_drain_finished",workerId,processedJobs,elapsedMs:Date.now()-startedAt,stopRequested:stopping,maxJobsReached:processedJobs>=maxJobs,maxRuntimeReached:Date.now()>=deadline}));
  return;
 }
 while(!stopping){
  try{const processed=await worker.runOnce();if(!processed)await new Promise(resolve=>setTimeout(resolve,pollMs));}
  catch(error){console.error(JSON.stringify({event:"execution_worker_iteration_failed",workerId,error:error instanceof Error?error.message:"Unknown worker error"}));await new Promise(resolve=>setTimeout(resolve,Math.min(5000,pollMs)));}
 }
 console.log(JSON.stringify({event:"execution_worker_stopped",workerId}));
}
main().catch(error=>{console.error(JSON.stringify({event:"execution_worker_fatal",error:error instanceof Error?error.message:"Unknown worker error"}));process.exitCode=1;});
