import {describe,it,expect} from "vitest";
import {ExecutionEngine,InMemoryExecutionJobStore} from "../src/execution/executor.js";
import {validateComputationOutput} from "../src/execution/computation-validation.js";

describe("execution lifecycle",()=>{
  it("persists succeeded jobs without promoting output information status",async()=>{
    const store=new InMemoryExecutionJobStore();
    const e=new ExecutionEngine([{
      id:"test",
      canExecute:()=>true,
      execute:async()=>({success:true,outputs:{status:"CALCULATED",value:4},warnings:[],artifactIds:[]})
    }],store);
    const j=await e.run({
      id:"job-1",capability:"TEST",backend:"typescript-safe",
      inputs:{},requestedOutputs:[],timeoutMs:1000
    });
    expect(j.status).toBe("SUCCEEDED");
    expect(j.result?.status).toBe("CALCULATED");
    expect((store.get("job-1") as any).status).toBe("SUCCEEDED");
  });
});

describe("computation validation",()=>{
  it("passes generic sanity checks but preserves CALCULATED status",()=>{
    const v=validateComputationOutput({status:"CALCULATED",value:4});
    expect(v.level).toBe("PASS");
    expect(v.status).toBe("CALCULATED");
    expect(v.checks).toContain("finite-numeric-values");
  });

  it("does not trust provider-supplied VERIFIED or VALIDATED claims",()=>{
    for(const status of ["VERIFIED","VALIDATED"]){
      const v=validateComputationOutput({status,value:4});
      expect(v.level).toBe("INCOMPLETE");
      expect(v.status).toBe("ASSUMED");
      expect(v.warnings.join(" ")).toContain("capability-specific evidence");
    }
  });

  it("rejects non-finite numbers at any nesting depth",()=>{
    const v=validateComputationOutput({status:"CALCULATED",result:{stressMpa:Infinity}});
    expect(v.level).toBe("FAIL");
    expect(v.status).toBe("ASSUMED");
  });

  it("rejects cyclic objects that cannot be safely fingerprinted",()=>{
    const output:Record<string,unknown>={status:"CALCULATED"};
    output.self=output;
    const v=validateComputationOutput(output);
    expect(v.level).toBe("FAIL");
    expect(v.status).toBe("ASSUMED");
  });

  it("returns incomplete when the provider has not marked the result calculated",()=>{
    const v=validateComputationOutput({value:4});
    expect(v.level).toBe("INCOMPLETE");
    expect(v.status).toBe("ASSUMED");
  });

  it("fails when the provider explicitly reports calculation failure",()=>{
    const v=validateComputationOutput({status:"FAILED",error:"Solver failed"});
    expect(v.level).toBe("FAIL");
    expect(v.status).toBe("ASSUMED");
  });

  it.each([null,undefined,42,"not an object",[]])("rejects malformed root output: %s",(output)=>{
    const v=validateComputationOutput(output);
    expect(v.level).toBe("FAIL");
    expect(v.status).toBe("ASSUMED");
  });
});
