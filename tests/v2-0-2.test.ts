import {describe,expect,it} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";
import {TaskGraphExecutionProvider} from "../src/providers/task-execution.js";
import {V2_0_2_CAPABILITIES} from "../src/capabilities/v2-0-2.js";
import {EngineeringTaskGraph} from "../src/task-graph/types.js";
import {EngineeringTask} from "../src/task-graph/types.js";
import {createProject} from "../src/state/project.js";

const stamp="2026-10-07T00:00:00.000Z";

function task(id:string,status:EngineeringTask["status"]="READY",overrides:Partial<EngineeringTask>={}):EngineeringTask{
  return {
    id,
    projectId:"P-1",
    name:id,
    goal:`perform ${id}`,
    capability:"ANALYSIS.SHAFT_TORQUE",
    risk:"LOW",
    input:{powerKw:5,rpm:1500},
    status,
    createdAt:stamp,
    updatedAt:stamp,
    ...overrides
  };
}

function graph(tasks:EngineeringTask[]):EngineeringTaskGraph{
  return {id:"TG-1",projectId:"P-1",revision:1,tasks};
}

describe("V2.0.2 task graph execution control",()=>{
  it("refuses to execute non-ready tasks",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(V2_0_2_CAPABILITIES);
    const router=new CapabilityRouter(registry);
    const provider=new TaskGraphExecutionProvider(router);
    const result=await provider.execute({
      capability:"TASK_GRAPH.EXECUTE_READY",
      risk:"HIGH",
      input:{taskGraph:graph([task("t1","PROPOSED")]),taskId:"t1",stage:"ANALYSIS"}
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Task must be READY");
  });

  it("executes a READY task through the existing workflow engine and returns COMPLETED",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(V2_0_2_CAPABILITIES);
    registry.registerCatalog([
      {id:"ANALYSIS.SHAFT_TORQUE",domain:"analysis",purpose:"torque",inputs:["powerKw","rpm"],outputs:["torqueNm"],risk:"LOW",providers:["numerical"],status:"PILOT"}
    ]);
    registry.register(new NumericalAnalysisProvider());
    const router=new CapabilityRouter(registry);
    const provider=new TaskGraphExecutionProvider(router);
    const project=createProject("shaft");
    project.id="P-1";
    const result=await provider.execute({
      capability:"TASK_GRAPH.EXECUTE_READY",
      risk:"HIGH",
      input:{taskGraph:graph([task("t1")]),taskId:"t1",stage:"ANALYSIS",project}
    });
    expect(result.success).toBe(true);
    const output=result.output as {status:string;graph:EngineeringTaskGraph};
    expect(output.status).toBe("COMPLETED");
    expect(output.graph.tasks[0].status).toBe("COMPLETED");
  });

  it("preserves evidence requirement as a blocking gate",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(V2_0_2_CAPABILITIES);
    registry.registerCatalog([
      {id:"ANALYSIS.SHAFT_TORQUE",domain:"analysis",purpose:"torque",inputs:["powerKw","rpm"],outputs:["torqueNm"],risk:"LOW",providers:["numerical"],status:"PILOT"}
    ]);
    registry.register(new NumericalAnalysisProvider());
    const router=new CapabilityRouter(registry);
    const provider=new TaskGraphExecutionProvider(router);
    const project=createProject("shaft");
    project.id="P-1";
    const result=await provider.execute({
      capability:"TASK_GRAPH.EXECUTE_READY",
      risk:"HIGH",
      input:{taskGraph:graph([task("t1","READY",{evidenceRequired:true})]),taskId:"t1",stage:"ANALYSIS",project}
    });
    expect(result.success).toBe(false);
    const output=result.output as {status:string;graph:EngineeringTaskGraph};
    expect(output.status).toBe("BLOCKED");
    expect(output.graph.tasks[0].status).toBe("BLOCKED");
  });

  it("reuses workflow requirement and approval gates",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(V2_0_2_CAPABILITIES);
    registry.registerCatalog([
      {id:"ANALYSIS.SHAFT_TORQUE",domain:"analysis",purpose:"torque",inputs:["powerKw","rpm"],outputs:["torqueNm"],risk:"LOW",providers:["numerical"],status:"PILOT"}
    ]);
    registry.register(new NumericalAnalysisProvider());
    const router=new CapabilityRouter(registry);
    const provider=new TaskGraphExecutionProvider(router);
    const project=createProject("shaft");
    project.id="P-1";
    project.requirements.push({id:"R1",name:"must be satisfied",priority:"MUST",status:"OPEN"});
    const result=await provider.execute({
      capability:"TASK_GRAPH.EXECUTE_READY",
      risk:"HIGH",
      input:{taskGraph:graph([task("t1","READY",{requiredRequirementIds:["R1"],approvalRequired:true,approvalGranted:false})]),taskId:"t1",stage:"ANALYSIS",project}
    });
    expect(result.success).toBe(false);
    const output=result.output as {status:string;workflowStep:{status:string};graph:EngineeringTaskGraph};
    expect(output.status).toBe("BLOCKED");
    expect(output.workflowStep.status).toBe("BLOCKED");
    expect(output.graph.tasks[0].status).toBe("BLOCKED");
  });
});
