import {describe,expect,it,vi} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {V2_0_1_CAPABILITIES} from "../src/capabilities/v2-0-1.js";
import {V2_0_2_CAPABILITIES} from "../src/capabilities/v2-0-2.js";
import {V2_0_4_CAPABILITIES} from "../src/capabilities/v2-0-4.js";
import {V2_0_5_CAPABILITIES} from "../src/capabilities/v2-0-5.js";
import {TaskGraphExecutionProvider} from "../src/providers/task-execution.js";
import {SpecialistDelegationProvider} from "../src/providers/specialist-delegation.js";
import {BoundedAutonomyProvider} from "../src/providers/bounded-autonomy.js";
import {EngineeringTask,EngineeringTaskGraph} from "../src/task-graph/types.js";
import {AgentActionProposal,AgentRunLimits,AgentRuntimeObservation} from "../src/agents/runtime.js";
import {LangGraphAgentRuntimeAdapter,LangGraphBridge} from "../src/agents/langgraph-adapter.js";

const stamp="2026-10-07T00:00:00.000Z";

function task(overrides:Partial<EngineeringTask>={}):EngineeringTask{
  return {
    id:"TASK-1",
    projectId:"P-1",
    name:"Compute shaft torque",
    goal:"Compute torque from power and speed",
    capability:"ANALYSIS.SHAFT_TORQUE",
    risk:"LOW",
    input:{powerKw:5,speedRpm:1500},
    status:"READY",
    createdAt:stamp,
    updatedAt:stamp,
    ...overrides
  };
}

function graph(tasks:EngineeringTask[]=[task()]):EngineeringTaskGraph{
  return {id:"TG-1",projectId:"P-1",revision:3,tasks};
}

function limits(overrides:Partial<AgentRunLimits>={}):AgentRunLimits{
  return {
    maxSteps:5,
    maxTaskExecutions:5,
    maxDelegations:5,
    maxRisk:"HIGH",
    stopOnFailure:true,
    ...overrides
  };
}

function setup(){
  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_1_CAPABILITIES);
  registry.registerCatalog(V2_0_2_CAPABILITIES);
  registry.registerCatalog(V2_0_4_CAPABILITIES);
  registry.registerCatalog(V2_0_5_CAPABILITIES);
  registry.registerCatalog([
    {
      id:"ANALYSIS.SHAFT_TORQUE",
      domain:"analysis",
      purpose:"torque",
      inputs:["powerKw","speedRpm"],
      outputs:["torqueNm"],
      risk:"LOW",
      providers:["test-analysis"],
      status:"PILOT"
    },
    {
      id:"ANALYSIS.CRITICAL_TEST",
      domain:"analysis",
      purpose:"critical test",
      inputs:[],
      outputs:[],
      risk:"CRITICAL",
      providers:["test-analysis"],
      status:"PILOT"
    }
  ]);
  const execute=vi.fn(async()=>({
    capability:"ANALYSIS.SHAFT_TORQUE",
    provider:"test-analysis",
    success:true,
    output:{torqueNm:31.83},
    evidenceIds:["EV-1"]
  }));
  registry.register({id:"test-analysis",capabilities:["ANALYSIS.SHAFT_TORQUE","ANALYSIS.CRITICAL_TEST"],execute});
  const router=new CapabilityRouter(registry);
  registry.register(new TaskGraphExecutionProvider(router));
  registry.register(new SpecialistDelegationProvider(registry));
  registry.register(new BoundedAutonomyProvider(router));
  return {router,execute};
}

describe("V2.0.5 bounded autonomy",()=>{
  it("executes a READY task only through the existing task-graph execution boundary",async()=>{
    const {router,execute}=setup();
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-1",
        taskGraph:graph(),
        actions:[{kind:"EXECUTE_TASK",taskId:"TASK-1",stage:"ANALYSIS",expectedGraphRevision:3}],
        limits:limits()
      }
    });
    expect(result.success).toBe(true);
    const report=result.output as {status:string;finalGraph:EngineeringTaskGraph;taskExecutions:number;evidenceIds:string[]};
    expect(report.status).toBe("COMPLETED");
    expect(report.taskExecutions).toBe(1);
    expect(report.finalGraph.revision).toBe(5);
    expect(report.finalGraph.tasks[0].status).toBe("COMPLETED");
    expect(report.evidenceIds).toEqual(["EV-1"]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects CRITICAL work before deterministic execution",async()=>{
    const {router,execute}=setup();
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-2",
        taskGraph:graph([task({risk:"CRITICAL"})]),
        actions:[{kind:"EXECUTE_TASK",taskId:"TASK-1",stage:"ANALYSIS"}],
        limits:limits()
      }
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("risk exceeds the bounded agent policy");
    expect((result.output as {actions:Array<{reason:string}>}).actions[0].reason).toContain("risk exceeds the bounded agent policy");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a CRITICAL capability even when the task is marked LOW risk",async()=>{
    const {router,execute}=setup();
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-3",
        taskGraph:graph([task({capability:"ANALYSIS.CRITICAL_TEST"})]),
        actions:[{kind:"EXECUTE_TASK",taskId:"TASK-1",stage:"ANALYSIS"}],
        limits:limits()
      }
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("risk exceeds the bounded agent policy");
    expect(execute).not.toHaveBeenCalled();
  });

  it("pauses on an explicit approval request without executing work",async()=>{
    const {router,execute}=setup();
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-4",
        taskGraph:graph(),
        actions:[{kind:"REQUEST_APPROVAL",taskId:"TASK-1",reason:"Approve the design calculation before execution."}],
        limits:limits()
      }
    });
    expect(result.success).toBe(false);
    const report=result.output as {status:string;taskExecutions:number;actions:Array<{status:string}>};
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.actions[0].status).toBe("WAITING_APPROVAL");
    expect(execute).not.toHaveBeenCalled();
  });

  it("enforces the step budget",async()=>{
    const {router,execute}=setup();
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-5",
        taskGraph:graph(),
        actions:[
          {kind:"EXECUTE_TASK",taskId:"TASK-1",stage:"ANALYSIS"},
          {kind:"STOP",reason:"should not be reached because the budget is exhausted"}
        ],
        limits:limits({maxSteps:1})
      }
    });
    expect(result.success).toBe(false);
    const report=result.output as {status:string;steps:number;taskExecutions:number;stopReason?:string};
    expect(report.status).toBe("STOPPED");
    expect(report.steps).toBe(1);
    expect(report.taskExecutions).toBe(1);
    expect(report.stopReason).toContain("step budget exhausted");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects stale agent actions after the task graph revision changes",async()=>{
    const {router,execute}=setup();
    const first=task();
    const second=task({id:"TASK-2",name:"Second calculation"});
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-6",
        taskGraph:graph([first,second]),
        actions:[
          {kind:"EXECUTE_TASK",taskId:"TASK-1",stage:"ANALYSIS",expectedGraphRevision:3},
          {kind:"EXECUTE_TASK",taskId:"TASK-2",stage:"ANALYSIS",expectedGraphRevision:3}
        ],
        limits:limits()
      }
    });
    expect(result.success).toBe(false);
    const report=result.output as {status:string;actions:Array<{status:string;reason:string}>;taskExecutions:number};
    expect(report.status).toBe("FAILED");
    expect(report.taskExecutions).toBe(1);
    expect(report.actions[1].status).toBe("BLOCKED");
    expect(report.actions[1].reason).toContain("graph revision is stale");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("delegates without executing and enforces specialist scope",async()=>{
    const {router,execute}=setup();
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-7",
        taskGraph:graph(),
        actions:[{kind:"DELEGATE_SPECIALIST",taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"}],
        limits:limits()
      }
    });
    expect(result.success).toBe(true);
    const report=result.output as {status:string;delegations:number;taskExecutions:number};
    expect(report.status).toBe("COMPLETED");
    expect(report.delegations).toBe(1);
    expect(report.taskExecutions).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a policy that attempts to permit CRITICAL autonomy",async()=>{
    const {router}=setup();
    const result=await router.execute({
      capability:"AGENT.RUN_BOUNDED",
      risk:"HIGH",
      input:{
        runId:"RUN-8",
        taskGraph:graph(),
        actions:[{kind:"STOP",reason:"no-op"}],
        limits:limits({maxRisk:"CRITICAL"})
      }
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds hard ceiling HIGH");
  });
});

describe("LangGraph runtime adapter",()=>{
  it("keeps LangGraph behind the framework-neutral runtime contract",async()=>{
    const bridge:LangGraphBridge={
      plan:vi.fn(async():Promise<readonly AgentActionProposal[]>=>[{kind:"STOP",reason:"planned"}]),
      delegate:vi.fn(async():Promise<AgentActionProposal>=>({kind:"DELEGATE_SPECIALIST",taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"})),
      requestApproval:vi.fn(async():Promise<AgentActionProposal>=>({kind:"REQUEST_APPROVAL",taskId:"TASK-1",reason:"review"})),
      resume:vi.fn(async():Promise<readonly AgentActionProposal[]>=>[{kind:"STOP",reason:"resumed"}]),
      observe:vi.fn(async(runId):Promise<AgentRuntimeObservation>=>({runId,status:"RUNNING",stepCount:0,taskExecutions:0,delegations:0})),
      stop:vi.fn(async(runId,reason):Promise<AgentRuntimeObservation>=>({runId,status:"STOPPED",stepCount:0,taskExecutions:0,delegations:0,stopReason:reason}))
    };
    const runtime=new LangGraphAgentRuntimeAdapter(bridge);
    expect(await runtime.plan({runId:"R",taskGraph:graph(),limits:limits()})).toEqual([{kind:"STOP",reason:"planned"}]);
    expect(await runtime.delegate({runId:"R",taskGraph:graph(),taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"})).toEqual({kind:"DELEGATE_SPECIALIST",taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"});
    expect(await runtime.requestApproval({runId:"R",taskGraph:graph(),taskId:"TASK-1",reason:"review"})).toEqual({kind:"REQUEST_APPROVAL",taskId:"TASK-1",reason:"review"});
    expect(await runtime.resume({runId:"R",taskGraph:graph(),limits:limits()})).toEqual([{kind:"STOP",reason:"resumed"}]);
    expect((await runtime.observe("R")).status).toBe("RUNNING");
    expect((await runtime.stop("R","done")).stopReason).toBe("done");
    expect(bridge.plan).toHaveBeenCalledTimes(1);
  });
});
