import {describe,expect,it,vi} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {V2_0_1_CAPABILITIES} from "../src/capabilities/v2-0-1.js";
import {V2_0_2_CAPABILITIES} from "../src/capabilities/v2-0-2.js";
import {V2_0_4_CAPABILITIES} from "../src/capabilities/v2-0-4.js";
import {SpecialistDelegationProvider} from "../src/providers/specialist-delegation.js";
import {EngineeringTask,EngineeringTaskGraph} from "../src/task-graph/types.js";

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

function graph(overrides:Partial<EngineeringTaskGraph>={}):EngineeringTaskGraph{
  return {id:"TG-1",projectId:"P-1",revision:3,tasks:[task()],...overrides};
}

function setup(){
  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_1_CAPABILITIES);
  registry.registerCatalog(V2_0_2_CAPABILITIES);
  registry.registerCatalog(V2_0_4_CAPABILITIES);
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
    }
  ]);
  const execute=vi.fn(async()=>({
    capability:"ANALYSIS.SHAFT_TORQUE",
    provider:"test-analysis",
    success:true,
    output:{torqueNm:31.83}
  }));
  registry.register({id:"test-analysis",capabilities:["ANALYSIS.SHAFT_TORQUE"],execute});
  registry.register(new SpecialistDelegationProvider(registry));
  return {router:new CapabilityRouter(registry),execute};
}

describe("V2.0.4 specialist delegation",()=>{
  it("delegates a READY task to the matching named specialist without executing it",async()=>{
    const {router,execute}=setup();
    const result=await router.execute({
      capability:"AGENT.DELEGATE_SPECIALIST",
      risk:"HIGH",
      input:{taskGraph:graph(),taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"}
    });
    expect(result.success).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    const output=result.output as {delegation:{status:string;specialistId:string;taskId:string;executionCapability:string}};
    expect(output.delegation.status).toBe("DELEGATED");
    expect(output.delegation.specialistId).toBe("analysis");
    expect(output.delegation.taskId).toBe("TASK-1");
    expect(output.delegation.executionCapability).toBe("TASK_GRAPH.EXECUTE_READY");
  });

  it("refuses a non-ready task",async()=>{
    const {router}=setup();
    const result=await router.execute({
      capability:"AGENT.DELEGATE_SPECIALIST",
      risk:"HIGH",
      input:{taskGraph:graph({tasks:[task({status:"PROPOSED"})]}),taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"}
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("requires a READY task");
  });

  it("refuses a specialist outside the capability domain",async()=>{
    const {router}=setup();
    const result=await router.execute({
      capability:"AGENT.DELEGATE_SPECIALIST",
      risk:"HIGH",
      input:{taskGraph:graph(),taskId:"TASK-1",specialistId:"cad",stage:"CAD"}
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not authorized for capability domain analysis");
  });

  it("refuses CRITICAL work because specialist risk ceilings stop at HIGH",async()=>{
    const {router}=setup();
    const result=await router.execute({
      capability:"AGENT.DELEGATE_SPECIALIST",
      risk:"HIGH",
      input:{taskGraph:graph({tasks:[task({risk:"CRITICAL"})]}),taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"}
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds specialist analysis risk ceiling HIGH");
  });

  it("refuses an invalid workflow stage at the runtime boundary",async()=>{
    const {router}=setup();
    const result=await router.execute({
      capability:"AGENT.DELEGATE_SPECIALIST",
      risk:"HIGH",
      input:{taskGraph:graph(),taskId:"TASK-1",specialistId:"analysis",stage:"NOT_A_STAGE"}
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Delegation stage is invalid");
  });

  it("refuses a CRITICAL capability even when the task itself is marked LOW risk",async()=>{
    const {router}=setup();
    const result=await router.execute({
      capability:"AGENT.DELEGATE_SPECIALIST",
      risk:"HIGH",
      input:{
        taskGraph:graph({tasks:[task({capability:"ANALYSIS.CRITICAL_TEST"})]}),
        taskId:"TASK-1",
        specialistId:"analysis",
        stage:"ANALYSIS"
      }
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Capability risk CRITICAL exceeds specialist analysis risk ceiling HIGH");
  });

  it("refuses an unknown capability definition",async()=>{
    const {router}=setup();
    const result=await router.execute({
      capability:"AGENT.DELEGATE_SPECIALIST",
      risk:"HIGH",
      input:{taskGraph:graph({tasks:[task({capability:"ANALYSIS.UNKNOWN"})]}),taskId:"TASK-1",specialistId:"analysis",stage:"ANALYSIS"}
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Capability definition not found");
  });
});
