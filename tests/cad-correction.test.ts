import {describe,it,expect} from "vitest";
import {executeWithCADCorrection} from "../src/cad/self-correction.js";
import {CADWorkerExecutor} from "../src/cad/execution.js";

describe("bounded CAD self-correction",()=>{
  it("retries execution failures and stops at the configured bound",async()=>{
    let calls=0;
    const executor:CADWorkerExecutor={async execute(request){
      calls++;
      return {success:false,backend:request.backend,warnings:[],error:"syntax error"};
    }};
    const validator={async validate(){throw new Error("validator should not run");}};
    const strategy={async reviseSource({source}:{source:string}){return source+"\n# revised";}};
    const result=await executeWithCADCorrection(executor,validator,{id:"x",backend:"build123d",source:"# source",filename:"part.py",timeoutMs:1000},strategy,3);
    expect(calls).toBe(3);
    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(3);
  });

  it("accepts after a validation-driven correction",async()=>{
    let calls=0;
    const executor:CADWorkerExecutor={async execute(request){
      calls++;
      return {success:true,backend:request.backend,warnings:[],solidArtifactPath:"/artifacts/part.step"};
    }};
    const validator={async validate(){
      return calls===1
        ? {valid:false,warnings:["self-intersection"],checkedBy:"test-validator"}
        : {valid:true,solidCount:1,warnings:[],checkedBy:"test-validator"};
    }};
    const strategy={async reviseSource({source}:{source:string}){return source+"\n# fixed";}};
    const result=await executeWithCADCorrection(executor,validator,{id:"x",backend:"build123d",source:"# source",filename:"part.py",timeoutMs:1000},strategy,3);
    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.finalSource).toContain("# fixed");
  });
});
