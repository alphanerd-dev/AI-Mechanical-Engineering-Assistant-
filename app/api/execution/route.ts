import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {authorizationFailureStatus,authorizeSupabaseRequest} from "../../../src/auth/supabase-service.js";
import {createServiceRoleClient} from "../../../lib/supabase/service.js";
import {ExecutionBackendAdapter,ExecutionEngine} from "../../../src/execution/executor.js";
import {HttpPythonWorkerClient} from "../../../src/execution/http-python-worker.js";
import {PythonWorkerAdapter} from "../../../src/execution/python-worker.js";
import {SafeNumericalAdapter} from "../../../src/execution/safe-numerical.js";
import {ExecutionJobStoreError,IdempotencyConflictError,SupabaseExecutionJobStore} from "../../../src/execution/supabase-job-store.js";
import {ExecutionBackend} from "../../../src/execution/types.js";
export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY=/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PYTHON_CAPABILITIES=new Set(["UNITS.CONVERT","UNITS.CHECK_DIMENSIONS","MATH.SYMBOLIC_SOLVE","MATH.NUMERICAL_SOLVE","MATH.OPTIMIZE"]);
function objectBody(value:unknown):Record<string,unknown>|undefined{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}
function jsonError(error:string,status:number,code?:string){return NextResponse.json({error,...(code?{code}:{})},{status,headers:{"cache-control":"no-store"}});}
function isBackend(value:unknown):value is Extract<ExecutionBackend,"typescript-safe"|"python-worker">{return value==="typescript-safe"||value==="python-worker";}

async function legacySynchronousPost(request:Request,body:Record<string,unknown>){
  let projectId:string|undefined;
  if(body.projectId!==undefined){
    if(typeof body.projectId!=="string"||!body.projectId.trim())return jsonError("projectId must be a non-empty string when provided.",400);
    projectId=body.projectId.trim();
  }
  let authorization:Awaited<ReturnType<typeof authorizeSupabaseRequest>>;
  try{authorization=await authorizeSupabaseRequest("TASK.EXECUTE",projectId);}
  catch{return jsonError("Engineering authorization is unavailable.",503);}
  if(!authorization.allowed){
    const status=authorizationFailureStatus(authorization);
    return jsonError(authorization.reason,status,status===503?"AUDIT_STORE_UNAVAILABLE":"ENGINEERING_ROLE_REQUIRED");
  }
  const capability=typeof body.capability==="string"?body.capability:"";
  const backend=body.backend==="python-worker"?"python-worker":"typescript-safe";
  const adapters:ExecutionBackendAdapter[]=[new SafeNumericalAdapter()];
  if(backend==="python-worker"&&process.env.PYTHON_WORKER_URL){
    adapters.push(new PythonWorkerAdapter(new HttpPythonWorkerClient(process.env.PYTHON_WORKER_URL,fetch,process.env.PYTHON_WORKER_API_TOKEN)));
  }
  const job=await new ExecutionEngine(adapters).run({
    id:randomUUID(),
    capability,
    backend,
    inputs:objectBody(body.inputs)??{},
    requestedOutputs:Array.isArray(body.requestedOutputs)?body.requestedOutputs as string[]:[],
    timeoutMs:backend==="python-worker"?30_000:2_000,
    projectId,
    correlationId:request.headers.get("x-request-id")??undefined
  });
  return NextResponse.json(job,{status:job.status==="SUCCEEDED"?200:422,headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
 const parsed=await request.json().catch(()=>({}));
 const body=objectBody(parsed)??{};
 // Keep the existing synchronous behavior until the migration and persistent
 // worker have been deployed and operators explicitly activate the durable path.
 if(process.env.DURABLE_EXECUTION_ENABLED!=="true")return legacySynchronousPost(request,body);
 if(!objectBody(parsed))return jsonError("Request body must be a JSON object.",400,"INVALID_REQUEST");
 const projectId=typeof body.projectId==="string"?body.projectId.trim():"";
 if(!UUID.test(projectId))return jsonError("A valid projectId is required for durable execution.",400,"PROJECT_ID_REQUIRED");
 const key=request.headers.get("idempotency-key")?.trim()??"";
 if(!IDEMPOTENCY.test(key))return jsonError("Provide an Idempotency-Key header containing 8-128 safe characters.",400,"IDEMPOTENCY_KEY_REQUIRED");
 const capability=typeof body.capability==="string"?body.capability.trim():"";
 if(!capability||capability.length>128)return jsonError("A supported capability name is required.",400,"CAPABILITY_REQUIRED");
 const backendCandidate=body.backend===undefined?"typescript-safe":body.backend;
 if(!isBackend(backendCandidate))return jsonError("Backend must be typescript-safe or python-worker.",400,"UNSUPPORTED_BACKEND");
 const backend=backendCandidate;
 if(backend==="typescript-safe"&&capability!=="ANALYSIS.SHAFT_TORQUE")return jsonError("The TypeScript backend does not support this capability.",422,"UNSUPPORTED_CAPABILITY");
 if(backend==="python-worker"&&!PYTHON_CAPABILITIES.has(capability))return jsonError("The Python worker capability is not allowlisted.",422,"UNSUPPORTED_CAPABILITY");
 if(backend==="python-worker"&&!process.env.PYTHON_WORKER_URL)return jsonError("The Python worker is not configured.",503,"WORKER_UNAVAILABLE");
 if(body.inputs!==undefined&&!objectBody(body.inputs))return jsonError("inputs must be a JSON object when provided.",400,"INVALID_INPUTS");
 const inputs=objectBody(body.inputs)??{};
 let inputSize:number;
 try{inputSize=JSON.stringify(inputs).length;}catch{return jsonError("inputs must be JSON serializable.",400,"INVALID_INPUTS");}
 if(inputSize>64_000)return jsonError("inputs exceed the 64 KB request limit.",413,"INPUT_TOO_LARGE");
 if(body.requestedOutputs!==undefined&&!Array.isArray(body.requestedOutputs))return jsonError("requestedOutputs must be an array when provided.",400,"INVALID_OUTPUTS");
 const requestedOutputs=Array.isArray(body.requestedOutputs)?body.requestedOutputs:[];
 if(requestedOutputs.length>64||requestedOutputs.some(item=>typeof item!=="string"||!item.trim()||item.length>128))return jsonError("requestedOutputs must be an array of at most 64 non-empty short strings.",400,"INVALID_OUTPUTS");
 let authorization;
 try{authorization=await authorizeSupabaseRequest("TASK.EXECUTE",projectId,{requestId:request.headers.get("x-request-id")??randomUUID()});}
 catch{return jsonError("Engineering authorization is unavailable.",503,"AUTHORIZATION_UNAVAILABLE");}
 if(!authorization.allowed){const status=authorizationFailureStatus(authorization);return jsonError(authorization.reason,status,status===503?"AUDIT_STORE_UNAVAILABLE":"ENGINEERING_ROLE_REQUIRED");}
 if(!authorization.subject)return jsonError("Authenticated owner identity is unavailable.",503,"IDENTITY_UNAVAILABLE");
 const jobId=randomUUID();
 const executionRequest={id:jobId,capability,backend,inputs,requestedOutputs:requestedOutputs as string[],timeoutMs:backend==="python-worker"?30_000:2_000,projectId,correlationId:request.headers.get("x-request-id")??jobId};
 try{
  const store=new SupabaseExecutionJobStore(createServiceRoleClient());
  const submitted=await store.submit({request:executionRequest,ownerId:authorization.subject,idempotencyKey:key});
  const statusUrl=`/api/execution/${submitted.job.id}?projectId=${encodeURIComponent(projectId)}`;
  return NextResponse.json({...submitted.job,idempotentReplay:!submitted.created,statusUrl,cancelUrl:statusUrl},{status:submitted.created?202:200,headers:{"cache-control":"no-store",location:statusUrl}});
 }catch(error){
  if(error instanceof IdempotencyConflictError)return jsonError(error.message,409,"IDEMPOTENCY_CONFLICT");
  if(error instanceof ExecutionJobStoreError)return jsonError("Durable execution storage is unavailable.",503,"EXECUTION_STORE_UNAVAILABLE");
  return jsonError("Execution request could not be durably queued.",503,"EXECUTION_QUEUE_FAILED");
 }
}
