import {NextResponse} from "next/server";
import {authorizationFailureStatus,authorizeSupabaseRequest} from "../../../../src/auth/supabase-service.js";
import {createServiceRoleClient} from "../../../../lib/supabase/service.js";
import {ExecutionJobStoreError,SupabaseExecutionJobStore} from "../../../../src/execution/supabase-job-store.js";
export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context={params:Promise<{jobId:string}>};
function errorResponse(message:string,status:number,code?:string){return NextResponse.json({error:message,...(code?{code}:{})},{status,headers:{"cache-control":"no-store"}});}
function readProjectId(request:Request):string|undefined{const value=new URL(request.url).searchParams.get("projectId")?.trim();return value&&UUID.test(value)?value:undefined;}
async function authorizeJob(request:Request,permission:"PROJECT.READ"|"TASK.EXECUTE",projectId:string){
 try{
  const decision=await authorizeSupabaseRequest(permission,projectId,{requestId:request.headers.get("x-request-id")});
  if(!decision.allowed){const status=authorizationFailureStatus(decision);return {response:errorResponse(decision.reason,status,status===503?"AUDIT_STORE_UNAVAILABLE":"ENGINEERING_ROLE_REQUIRED")};}
  return {};
 }catch{return {response:errorResponse("Engineering authorization is unavailable.",503,"AUTHORIZATION_UNAVAILABLE")};}
}
export async function GET(request:Request,context:Context){
 const {jobId}=await context.params;
 if(!UUID.test(jobId))return errorResponse("A valid jobId is required.",400,"INVALID_JOB_ID");
 const projectId=readProjectId(request);
 if(!projectId)return errorResponse("projectId is required to authorize this job read.",400,"PROJECT_ID_REQUIRED");
 const authorization=await authorizeJob(request,"PROJECT.READ",projectId);
 if(authorization.response)return authorization.response;
 try{
  const job=await new SupabaseExecutionJobStore(createServiceRoleClient()).getForProject(jobId,projectId);
  if(!job)return errorResponse("Execution job was not found in this project.",404,"JOB_NOT_FOUND");
  return NextResponse.json(job,{headers:{"cache-control":"no-store"}});
 }catch(error){
  if(error instanceof ExecutionJobStoreError)return errorResponse("Execution job storage is unavailable.",503,"EXECUTION_STORE_UNAVAILABLE");
  return errorResponse("Execution job could not be read.",503,"EXECUTION_READ_FAILED");
 }
}
export async function DELETE(request:Request,context:Context){
 const {jobId}=await context.params;
 if(!UUID.test(jobId))return errorResponse("A valid jobId is required.",400,"INVALID_JOB_ID");
 const projectId=readProjectId(request);
 if(!projectId)return errorResponse("projectId is required to authorize this cancellation.",400,"PROJECT_ID_REQUIRED");
 const authorization=await authorizeJob(request,"TASK.EXECUTE",projectId);
 if(authorization.response)return authorization.response;
 try{
  const job=await new SupabaseExecutionJobStore(createServiceRoleClient()).requestCancellation(jobId,projectId);
  if(!job)return errorResponse("Execution job was not found in this project.",404,"JOB_NOT_FOUND");
  return NextResponse.json({job,cancellationPending:job.status==="RUNNING"&&Boolean(job.cancelRequestedAt)},{headers:{"cache-control":"no-store"}});
 }catch(error){
  if(error instanceof ExecutionJobStoreError)return errorResponse("Execution job storage is unavailable.",503,"EXECUTION_STORE_UNAVAILABLE");
  return errorResponse("Execution cancellation could not be recorded.",503,"CANCELLATION_FAILED");
 }
}
