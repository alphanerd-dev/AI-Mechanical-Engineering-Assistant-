import {describe,it,expect} from "vitest";
import {evaluateCADAcceptance} from "../src/cad/acceptance.js";
import {CAD_CODE_WORKER_POLICY,validateCADWorkerRequest} from "../src/execution/cad-worker-policy.js";
import {CADWorkerProvider} from "../src/providers/cad-worker.js";

describe("CAD execution foundation",()=>{
 it("accepts independently validated solid geometry",()=>{
  const result=evaluateCADAcceptance({valid:true,solidCount:1,warnings:[],checkedBy:"occt"});
  expect(result.status).toBe("ACCEPTED");
 });
 it("blocks invalid geometry",()=>{
  const result=evaluateCADAcceptance({valid:false,solidCount:1,warnings:["self intersection"],checkedBy:"occt"});
  expect(result.status).toBe("REJECTED");
 });
 it("reports missing validation as incomplete",()=>{expect(evaluateCADAcceptance(undefined).status).toBe("INCOMPLETE");});
 it("reports missing solid count as incomplete",()=>{
  expect(evaluateCADAcceptance({valid:true,warnings:[],checkedBy:"occt"}).status).toBe("INCOMPLETE");
 });
 it("enforces the CAD worker boundary",()=>{
  expect(validateCADWorkerRequest(CAD_CODE_WORKER_POLICY,"CAD.EXECUTE_GENERATED_SOURCE","build123d",30000)).toEqual([]);
  expect(validateCADWorkerRequest(CAD_CODE_WORKER_POLICY,"CAD.EXECUTE_GENERATED_SOURCE","unknown",30000).length).toBeGreaterThan(0);
 });
 it("does not pretend a runtime exists",async()=>{
  const result=await new CADWorkerProvider().execute({capability:"CAD.EXECUTE_GENERATED_SOURCE",risk:"HIGH",input:{backend:"build123d",source:"print(1)",filename:"x.py",timeoutMs:1000}});
  expect(result.success).toBe(false);
  expect(result.error).toContain("not configured");
 });
});
