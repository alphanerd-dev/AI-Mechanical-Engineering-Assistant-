import {describe,expect,it} from "vitest";
import {ExecutionEngine} from "../src/execution/index.js";
import {PythonWorkerAdapter,PythonWorkerClient} from "../src/execution/python-worker.js";
import {ExecutionResult} from "../src/execution/types.js";

class FakePythonWorker implements PythonWorkerClient{
  async run(request:any):Promise<ExecutionResult>{
    if(request.capability==="MATH.NUMERICAL_SOLVE"){
      const coefficients=request.inputs.polynomialCoefficients as number[];
      const solution=3;
      const residual=Math.abs(coefficients.reduce((acc:number,c:number)=>acc*solution+c,0));
      return {success:true,outputs:{solution,residual,engine:"python-worker"},warnings:[],artifactIds:[]};
    }
    return {success:true,outputs:{value:5000,unit:"W",engine:"python-worker"},warnings:[],artifactIds:[]};
  }
}

describe("controlled Python worker boundary",()=>{
  it("routes an allowlisted computation to the Python worker",async()=>{
    const engine=new ExecutionEngine([new PythonWorkerAdapter(new FakePythonWorker())]);
    const job=await engine.run({
      id:"py-job-001",capability:"MATH.NUMERICAL_SOLVE",backend:"python-worker",
      inputs:{polynomialCoefficients:[1,-3],bounds:[-10,10]},requestedOutputs:["solution"],timeoutMs:1000
    });
    expect(job.status).toBe("SUCCEEDED");
    expect(job.result?.solution).toBe(3);
    expect(job.result?.engine).toBe("python-worker");
  });

  it("does not allow arbitrary Python execution",()=>{
    const adapter=new PythonWorkerAdapter(new FakePythonWorker());
    expect(adapter.canExecute({
      id:"blocked",capability:"EXECUTE_ARBITRARY_PYTHON",backend:"python-worker",
      inputs:{source:"print('unsafe')"},requestedOutputs:[],timeoutMs:1000
    })).toBe(false);
  });
});
