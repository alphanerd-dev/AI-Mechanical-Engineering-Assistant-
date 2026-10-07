import {describe,expect,it} from "vitest";
import {createProject} from "../src/state/project.js";
import {EngineeringTaskGraph} from "../src/task-graph/types.js";
import {getReadyTasks} from "../src/task-graph/ready.js";
import {canTransitionTask,transitionTask,validateEngineeringTaskGraph} from "../src/task-graph/validation.js";
import {InMemoryEngineeringWorkspaceStore} from "../src/workspace/store.js";
import {deserializeEngineeringWorkspaceSnapshot,serializeEngineeringWorkspaceSnapshot,validateEngineeringWorkspaceSnapshot} from "../src/workspace/validation.js";
import {ENGINEERING_WORKSPACE_SCHEMA_VERSION,EngineeringWorkspaceSnapshot} from "../src/workspace/types.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {V2_0_1_CAPABILITIES} from "../src/capabilities/v2-0-1.js";
import {EngineeringWorkspaceProvider} from "../src/providers/workspace.js";

const stamp="2026-10-07T00:00:00.000Z";
function task(id:string,status:"PROPOSED"|"READY"|"RUNNING"|"BLOCKED"|"COMPLETED"|"FAILED"|"VERIFIED"="PROPOSED",overrides:Partial<EngineeringTaskGraph["tasks"][number]>={}){
  return {
    id,projectId:"P-1",name:id,goal:`goal ${id}`,capability:"ANALYSIS.SHAFT_TORQUE",risk:"LOW" as const,
    input:{},status,createdAt:stamp,updatedAt:stamp,...overrides
  };
}
function graph(tasks:EngineeringTaskGraph["tasks"]):EngineeringTaskGraph{
  return {id:"TG-1",projectId:"P-1",revision:1,tasks};
}
function workspace():EngineeringWorkspaceSnapshot{
  const project=createProject("shaft");
  project.id="P-1";
  return {schemaVersion:ENGINEERING_WORKSPACE_SCHEMA_VERSION,id:"W-1",name:"Shaft Workspace",project,
    taskGraph:graph([task("t1")]),revision:1,savedAt:stamp};
}

describe("V2.0.1 task graph foundation",()=>{
  it("rejects duplicate ids, missing dependencies, project leaks and cycles",()=>{
    expect(validateEngineeringTaskGraph(graph([
      task("a"),
      task("a"),
      task("b","PROPOSED",{projectId:"OTHER"}),
      task("c","PROPOSED",{dependsOn:["missing"]}),
      task("d","PROPOSED",{dependsOn:["d"]})
    ]))).toEqual(expect.arrayContaining([
      "Duplicate engineering task id: a.",
      "Engineering task belongs to another project: b.",
      "Engineering task dependency not found: c -> missing.",
      "Engineering task cannot depend on itself: d."
    ]));
  });

  it("detects longer dependency cycles",()=>{
    const errors=validateEngineeringTaskGraph(graph([
      task("a","PROPOSED",{dependsOn:["c"]}),
      task("b","PROPOSED",{dependsOn:["a"]}),
      task("c","PROPOSED",{dependsOn:["b"]})
    ]));
    expect(errors.some(error=>error.includes("dependency cycle detected"))).toBe(true);
  });

  it("returns ready only when dependencies, requirements, approval and capability gates pass",()=>{
    const project=createProject("shaft");
    project.id="P-1";
    project.requirements.push({id:"R1",name:"torque",priority:"MUST",status:"SATISFIED"});
    const g=graph([
      task("done","COMPLETED"),
      task("waiting","PROPOSED",{dependsOn:["done"],requiredRequirementIds:["R1"]}),
      task("needsApproval","PROPOSED",{dependsOn:["done"],requiredRequirementIds:["R1"],approvalRequired:true}),
      task("noReq","PROPOSED",{dependsOn:["done"],requiredRequirementIds:["R2"]}),
      task("noCapability","PROPOSED",{dependsOn:["done"],capability:undefined})
    ]);
    const evaluations=getReadyTasks(g,project);
    expect(evaluations.find(x=>x.taskId==="waiting")?.ready).toBe(true);
    expect(evaluations.find(x=>x.taskId==="needsApproval")?.ready).toBe(false);
    expect(evaluations.find(x=>x.taskId==="noReq")?.ready).toBe(false);
    expect(evaluations.find(x=>x.taskId==="noCapability")?.ready).toBe(false);
  });

  it("enforces explicit task state transitions",()=>{
    expect(canTransitionTask("PROPOSED","READY")).toBe(true);
    expect(canTransitionTask("PROPOSED","RUNNING")).toBe(false);
    const ready=transitionTask(graph([task("t1")]),"t1","READY");
    expect(ready.revision).toBe(2);
    expect(ready.tasks[0].status).toBe("READY");
    expect(()=>transitionTask(ready,"t1","VERIFIED")).toThrow("Invalid engineering task transition");
  });
});

describe("V2.0.1 workspace persistence",()=>{
  it("keeps workspace revisions immutable and conflict-protected",()=>{
    const store=new InMemoryEngineeringWorkspaceStore();
    const first=store.save(workspace(),0);
    expect(first.revision).toBe(1);
    const second={...first,name:"updated"};
    expect(()=>store.save(second,0)).toThrow("Workspace revision conflict");
    const saved=store.save(second,1);
    expect(saved.revision).toBe(2);
    expect(store.get("W-1")?.name).toBe("updated");
    first.name="mutated outside store";
    expect(store.get("W-1")?.name).toBe("updated");
  });

  it("round-trips and validates the whole workspace snapshot",()=>{
    const snapshot=workspace();
    const restored=deserializeEngineeringWorkspaceSnapshot(serializeEngineeringWorkspaceSnapshot(snapshot));
    expect(restored).toEqual(snapshot);
    expect(()=>validateEngineeringWorkspaceSnapshot({...snapshot,schemaVersion:2} as typeof snapshot))
      .toThrow("Unsupported engineering workspace schema version");
  });
});

describe("V2.0.1 routed capabilities",()=>{
  it("registers and routes workspace/task capabilities",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(V2_0_1_CAPABILITIES);
    registry.register(new EngineeringWorkspaceProvider());
    const router=new CapabilityRouter(registry);
    const validation=await router.execute({capability:"TASK_GRAPH.VALIDATE",risk:"LOW",input:{taskGraph:graph([task("t1")])}});
    expect(validation.success).toBe(true);
    expect((validation.output as {valid:boolean}).valid).toBe(true);
    const created=await router.execute({capability:"WORKSPACE.CREATE",risk:"MEDIUM",input:{workspace:workspace()}});
    expect(created.success).toBe(true);
    const fetched=await router.execute({capability:"WORKSPACE.GET",risk:"LOW",input:{workspaceId:"W-1"}});
    expect(fetched.success).toBe(true);
    expect((fetched.output as EngineeringWorkspaceSnapshot).revision).toBe(1);
  });
});
