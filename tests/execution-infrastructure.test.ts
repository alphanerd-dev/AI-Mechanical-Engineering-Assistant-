import {describe,expect,it} from "vitest";
import {InMemoryExecutionQueue} from "../src/execution/queue.js";
import {DEFAULT_AUTHORIZATION_POLICY} from "../src/execution/authorization.js";
import {HttpExecutionWorkerService} from "../src/execution/worker-service.js";

describe("execution infrastructure contracts",()=>{
  it("queues and acknowledges a job",async()=>{
    const queue=new InMemoryExecutionQueue();
    const request={id:"job-1",capability:"MATH.NUMERICAL_SOLVE",backend:"python-worker" as const,inputs:{},requestedOutputs:["solution"],timeoutMs:5000};
    await queue.enqueue({id:"job-1",request,attempts:0,enqueuedAt:new Date().toISOString()});
    expect((await queue.dequeue())?.id).toBe("job-1");
    const result={success:true,outputs:{solution:42},warnings:[],artifactIds:[]};
    await queue.acknowledge("job-1",result);
    expect(queue.getCompleted("job-1")?.outputs.solution).toBe(42);
  });

  it("blocks high-risk execution until approval",()=>{
    const pending=DEFAULT_AUTHORIZATION_POLICY.authorize({capability:"ANALYSIS.STATIC_STRUCTURAL",risk:"HIGH"});
    expect(pending.status).toBe("PENDING");
    const approved=DEFAULT_AUTHORIZATION_POLICY.authorize(
      {capability:"ANALYSIS.STATIC_STRUCTURAL",risk:"HIGH"},
      {capability:"ANALYSIS.STATIC_STRUCTURAL",risk:"HIGH",status:"APPROVED",actorId:"engineer"}
    );
    expect(approved.status).toBe("APPROVED");
  });

  it("submits through the external worker HTTP contract",async()=>{
    const calls:Array<{url:string;method?:string}>=[];
    const fetchMock=async(input:RequestInfo|URL,init?:RequestInit)=>{
      calls.push({url:String(input),method:init?.method});
      return new Response(JSON.stringify({accepted:true,jobId:"worker-1",status:"QUEUED"}),{status:202,headers:{"content-type":"application/json"}});
    };
    const service=new HttpExecutionWorkerService("https://worker.example",fetchMock);
    const response=await service.submit({id:"job-1",capability:"UNITS.CONVERT",backend:"python-worker",inputs:{},requestedOutputs:["value"],timeoutMs:5000});
    expect(response.accepted).toBe(true);
    expect(response.jobId).toBe("worker-1");
    expect(calls[0].url).toContain("/v1/jobs");
    expect(calls[0].method).toBe("POST");
  });
});
