import {describe,it,expect} from "vitest";
import {HttpPythonWorkerClient} from "../src/execution/http-python-worker.js";

describe("HTTP Python worker client",()=>{
  it("returns a worker rejection without polling",async()=>{
    const calls:string[]=[];
    const fetchMock=async(input:RequestInfo|URL)=>{
      calls.push(String(input));
      return new Response(JSON.stringify({accepted:false,jobId:"",status:"REJECTED",error:"blocked"}),{status:403,headers:{"content-type":"application/json"}});
    };
    const client=new HttpPythonWorkerClient("http://worker.test",fetchMock);
    const result=await client.run({
      id:"job-1",capability:"MATH.OPTIMIZE",backend:"python-worker",
      inputs:{},requestedOutputs:[],timeoutMs:1000
    });
    expect(result.success).toBe(false);
    expect(result.warnings).toEqual(["blocked"]);
    expect(calls).toHaveLength(1);
  });

  it("submits and polls until the worker succeeds",async()=>{
    let polls=0;
    const fetchMock=async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      if(init?.method==="POST"){
        return new Response(JSON.stringify({accepted:true,jobId:"job-2",status:"QUEUED"}),{status:202});
      }
      polls++;
      if(polls===1) return new Response(JSON.stringify({jobId:"job-2",status:"RUNNING"}),{status:200});
      return new Response(JSON.stringify({
        jobId:"job-2",status:"SUCCEEDED",
        result:{success:true,outputs:{solution:3},warnings:[],artifactIds:[],provider:"python-engineering-worker"}
      }),{status:200});
    };
    const client=new HttpPythonWorkerClient("http://worker.test",fetchMock,undefined,{pollIntervalMs:0,maxPolls:2});
    const result=await client.run({
      id:"job-2",capability:"MATH.NUMERICAL_SOLVE",backend:"python-worker",
      inputs:{polynomialCoefficients:[1,-3]},requestedOutputs:["solution"],timeoutMs:1000
    });
    expect(result.success).toBe(true);
    expect(result.outputs.solution).toBe(3);
    expect(polls).toBe(2);
  });
});
