import {describe,expect,it} from "vitest";
import {ExecutionEngine,ExecutionQueue,createExecutionArtifactHandoff,InMemoryExecutionArtifactHandoffStore,SafeNumericalAdapter} from "../src/execution/index.js";
import {ExecutionBackendAdapter} from "../src/execution/executor.js";
import {ExecutionResult,ExecutionRequest} from "../src/execution/types.js";


function request(id:string):ExecutionRequest{
  return {
    id,
    capability:"ANALYSIS.SHAFT_TORQUE",
    backend:"typescript-safe",
    inputs:{powerKw:5,speedRpm:1500},
    requestedOutputs:["torqueNm"],
    timeoutMs:1000,
    projectId:"P-1"
  };
}

describe("V1.14 execution queue and artifact handoff",()=>{
  it("queues execution and respects the configured concurrency",async()=>{
    let active=0;
    let peak=0;
    const adapter:ExecutionBackendAdapter={
      id:"test-backend",
      canExecute:()=>true,
      async execute(input:ExecutionRequest):Promise<ExecutionResult>{
        active++;
        peak=Math.max(peak,active);
        await new Promise(resolve=>setTimeout(resolve,20));
        active--;
        return {
          success:true,
          outputs:{jobId:input.id},
          warnings:[],
          artifactIds:[`ART-${input.id}`]
        };
      }
    };
    const queue=new ExecutionQueue(new ExecutionEngine([adapter]),{concurrency:1});
    const jobs=await Promise.all([queue.enqueue(request("Q-1")),queue.enqueue(request("Q-2"))]);
    expect(jobs.map(job=>job.status)).toEqual(["SUCCEEDED","SUCCEEDED"]);
    expect(peak).toBe(1);
  });

  it("rejects duplicate queued or active job ids",async()=>{
    const queue=new ExecutionQueue(new ExecutionEngine([new SafeNumericalAdapter()]),{concurrency:1});
    const first=queue.enqueue(request("DUP-1"));
    await expect(queue.enqueue(request("DUP-1"))).rejects.toThrow("already queued or running");
    await first;
  });

  it("enforces fail-closed artifact handoff",async()=>{
    const engine=new ExecutionEngine([new SafeNumericalAdapter()]);
    const job=await engine.run(request("HANDOFF-1"));
    const stored=await engine.getJob(job.id);
    expect(stored?.status).toBe("SUCCEEDED");
    expect(()=>createExecutionArtifactHandoff(stored!)).toThrow("without artifacts to hand off");
  });

  it("preserves execution provenance when an artifact-producing job is handed off",async()=>{
    const adapter:ExecutionBackendAdapter={
      id:"artifact-backend",
      canExecute:()=>true,
      async execute():Promise<ExecutionResult>{
        return {
          success:true,
          outputs:{value:42},
          warnings:[],
          artifactIds:["ART-42"],
          evidenceIds:["EV-42"],
          provider:"artifact-provider",
          providerVersion:"1.0.0"
        };
      }
    };
    const engine=new ExecutionEngine([adapter]);
    const job=await engine.run({...request("HANDOFF-2"),capability:"TEST.ARTIFACT"});
    const handoff=createExecutionArtifactHandoff(job);
    const store=new InMemoryExecutionArtifactHandoffStore();
    await store.save(handoff);
    const stored=await store.get("HANDOFF-2");
    expect(stored?.artifactIds).toEqual(["ART-42"]);
    expect(stored?.evidenceIds).toEqual(["EV-42"]);
    expect(stored?.provenance.provider).toBe("artifact-provider");
    expect(stored?.provenance.outputDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires provenance even for a succeeded artifact job",async()=>{
    const adapter:ExecutionBackendAdapter={
      id:"bad-backend",
      canExecute:()=>true,
      async execute():Promise<ExecutionResult>{
        return {success:true,outputs:{value:1},warnings:[],artifactIds:["ART-1"]};
      }
    };
    const engine=new ExecutionEngine([adapter]);
    const job=await engine.run({...request("HANDOFF-3"),capability:"TEST.ARTIFACT"});
    const incomplete={...job,provenance:undefined};
    expect(()=>createExecutionArtifactHandoff(incomplete)).toThrow("provenance is required");
  });
});
