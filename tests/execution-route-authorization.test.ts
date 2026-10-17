import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const PROJECT="20000000-0000-4000-8000-000000000001";
const JOB="10000000-0000-4000-8000-000000000001";
const mocks=vi.hoisted(()=>({authorize:vi.fn(),submit:vi.fn(),getForProject:vi.fn(),requestCancellation:vi.fn(),constructStore:vi.fn(),constructEngine:vi.fn(),legacyRun:vi.fn()}));
vi.mock("../src/auth/supabase-service.js",()=>({
 authorizeSupabaseRequest:mocks.authorize,
 authorizationFailureStatus:(decision:{reason?:string})=>decision.reason==="Durable authorization audit is unavailable."?503:403
}));
vi.mock("../lib/supabase/service.js",()=>({createServiceRoleClient:()=>({admin:true})}));
vi.mock("../src/execution/executor.js",()=>({
 ExecutionEngine:class{
  constructor(adapters:unknown[]){mocks.constructEngine(adapters);}
  run(request:unknown){return mocks.legacyRun(request);}
 }
}));
vi.mock("../src/execution/safe-numerical.js",()=>({SafeNumericalAdapter:class{}}));
vi.mock("../src/execution/python-worker.js",()=>({PythonWorkerAdapter:class{}}));
vi.mock("../src/execution/http-python-worker.js",()=>({HttpPythonWorkerClient:class{}}));
vi.mock("../src/execution/supabase-job-store.js",()=>({
 SupabaseExecutionJobStore:class{
  constructor(){mocks.constructStore();}
  submit(input:unknown){return mocks.submit(input);}
  getForProject(id:string,projectId:string){return mocks.getForProject(id,projectId);}
  requestCancellation(id:string,projectId:string){return mocks.requestCancellation(id,projectId);}
 },
 ExecutionJobStoreError:class extends Error{},
 IdempotencyConflictError:class extends Error{constructor(){super("This Idempotency-Key was already used with a different execution request.");}}
}));
import {POST} from "../app/api/execution/route.js";
import {GET,DELETE} from "../app/api/execution/[jobId]/route.js";
import {IdempotencyConflictError} from "../src/execution/supabase-job-store.js";
function postRequest(body:unknown,key="test-key-0001"){
 return new Request("http://localhost/api/execution",{method:"POST",headers:{"content-type":"application/json","idempotency-key":key},body:JSON.stringify(body)});
}
function routeRequest(method:"GET"|"DELETE"="GET"){
 return new Request(`http://localhost/api/execution/${JOB}?projectId=${PROJECT}`,{method});
}
const fakeJob={id:JOB,status:"QUEUED",request:{id:JOB,capability:"ANALYSIS.SHAFT_TORQUE",backend:"typescript-safe",inputs:{powerKw:5,speedRpm:1500},requestedOutputs:["torqueNm"],timeoutMs:2000,projectId:PROJECT},createdAt:new Date(0).toISOString(),artifactIds:[],evidenceIds:[]};

describe("durable execution API authorization and idempotency",()=>{
 beforeEach(()=>{
  vi.stubEnv("DURABLE_EXECUTION_ENABLED","true");
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({allowed:true,subject:"user-1",reason:"Authorized."});
  mocks.submit.mockResolvedValue({job:fakeJob,created:true});
  mocks.getForProject.mockResolvedValue(fakeJob);
  mocks.requestCancellation.mockResolvedValue(fakeJob);
  mocks.legacyRun.mockResolvedValue({id:JOB,status:"SUCCEEDED"});
 });
 afterEach(()=>{vi.unstubAllEnvs();});

 it("authorizes project execution before durably submitting a job",async()=>{
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE",backend:"typescript-safe",inputs:{powerKw:5,speedRpm:1500},requestedOutputs:["torqueNm"]}));
  expect(response.status).toBe(202);expect(mocks.authorize).toHaveBeenCalledWith("TASK.EXECUTE",PROJECT,expect.any(Object));expect(mocks.submit).toHaveBeenCalledTimes(1);expect(mocks.constructEngine).not.toHaveBeenCalled();
 });

 it("returns the existing durable job on an idempotent replay",async()=>{
  mocks.submit.mockResolvedValue({job:fakeJob,created:false});
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE",backend:"typescript-safe",inputs:{powerKw:5,speedRpm:1500}}));
  const body=await response.json() as {idempotentReplay?:boolean;id?:string};
  expect(response.status).toBe(200);expect(body.idempotentReplay).toBe(true);expect(body.id).toBe(JOB);
 });

 it("returns 409 when an idempotency key is reused for a different request",async()=>{
  mocks.submit.mockRejectedValue(new IdempotencyConflictError());
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE",backend:"typescript-safe",inputs:{powerKw:6,speedRpm:1500}}));
  const body=await response.json() as {code?:string};
  expect(response.status).toBe(409);expect(body.code).toBe("IDEMPOTENCY_CONFLICT");
 });

 it("rejects malformed requestedOutputs instead of silently dropping them",async()=>{
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE",requestedOutputs:"torqueNm"}));
  expect(response.status).toBe(400);expect(mocks.submit).not.toHaveBeenCalled();
 });

 it("rejects missing idempotency keys without hitting the database",async()=>{
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE"},""));
  expect(response.status).toBe(400);expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.submit).not.toHaveBeenCalled();
 });
 it("fails closed when authorization is denied",async()=>{
  mocks.authorize.mockResolvedValue({allowed:false,reason:"Permission denied: TASK.EXECUTE."});
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE"}));
  expect(response.status).toBe(403);expect(mocks.submit).not.toHaveBeenCalled();
 });
 it("fails closed when authorization infrastructure is unavailable",async()=>{
  mocks.authorize.mockRejectedValue(new Error("Supabase unavailable"));
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE"}));
  expect(response.status).toBe(503);expect(mocks.submit).not.toHaveBeenCalled();
 });
 it("rejects capabilities outside the selected backend allowlist",async()=>{
  const response=await POST(postRequest({projectId:PROJECT,capability:"EXECUTE_ARBITRARY_PYTHON",backend:"python-worker"}));
  expect(response.status).toBe(422);expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.submit).not.toHaveBeenCalled();
 });
 it("rejects a malformed inputs object before durable submission",async()=>{
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE",inputs:[]}));
  expect(response.status).toBe(400);expect(mocks.submit).not.toHaveBeenCalled();
 });
 it("requires PROJECT.READ before exposing job results",async()=>{
  const response=await GET(routeRequest("GET"),{params:Promise.resolve({jobId:JOB})});
  expect(response.status).toBe(200);expect(mocks.authorize).toHaveBeenCalledWith("PROJECT.READ",PROJECT,expect.any(Object));expect(mocks.getForProject).toHaveBeenCalledWith(JOB,PROJECT);
 });
 it("requires TASK.EXECUTE before requesting cancellation",async()=>{
  const response=await DELETE(routeRequest("DELETE"),{params:Promise.resolve({jobId:JOB})});
  expect(response.status).toBe(200);expect(mocks.authorize).toHaveBeenCalledWith("TASK.EXECUTE",PROJECT,expect.any(Object));expect(mocks.requestCancellation).toHaveBeenCalledWith(JOB,PROJECT);
 });
 it("rejects a status lookup without project scope",async()=>{
  const response=await GET(new Request(`http://localhost/api/execution/${JOB}`),{params:Promise.resolve({jobId:JOB})});
  expect(response.status).toBe(400);expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.getForProject).not.toHaveBeenCalled();
 });
 it("preserves the synchronous endpoint until the durable workflow is explicitly enabled",async()=>{
  vi.stubEnv("DURABLE_EXECUTION_ENABLED","false");
  const response=await POST(postRequest({projectId:PROJECT,capability:"ANALYSIS.SHAFT_TORQUE",inputs:{powerKw:5,speedRpm:1500}},""));
  expect(response.status).toBe(200);
  expect(mocks.authorize).toHaveBeenCalledWith("TASK.EXECUTE",PROJECT);
  expect(mocks.constructEngine).toHaveBeenCalledTimes(1);
  expect(mocks.legacyRun).toHaveBeenCalledWith(expect.objectContaining({capability:"ANALYSIS.SHAFT_TORQUE",projectId:PROJECT}));
  expect(mocks.submit).not.toHaveBeenCalled();
 });
 it("keeps durable status and cancel endpoints closed until explicit activation",async()=>{
  vi.stubEnv("DURABLE_EXECUTION_ENABLED","false");
  const status=await GET(routeRequest("GET"),{params:Promise.resolve({jobId:JOB})});
  const cancel=await DELETE(routeRequest("DELETE"),{params:Promise.resolve({jobId:JOB})});
  expect(status.status).toBe(404);expect(cancel.status).toBe(404);expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.constructStore).not.toHaveBeenCalled();
 });
});
