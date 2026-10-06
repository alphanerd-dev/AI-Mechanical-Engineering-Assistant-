import {describe,expect,it} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {CapabilityProvider} from "../src/capabilities/registry.js";
import {EngineeringWorkflowEngine} from "../src/orchestration/engine.js";
import {EngineeringOrchestratorProvider} from "../src/providers/orchestrator.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {createProject} from "../src/state/project.js";

function provider(
  id:string,
  capabilities:string[],
  execute:(capability:string,input:Record<string,unknown>)=>Promise<{success:boolean;output?:unknown;artifactIds?:string[];evidenceIds?:string[];error?:string}>
):CapabilityProvider{
  return {id,capabilities,execute:async request=>{
    const result=await execute(request.capability,request.input);
    return {capability:request.capability,provider:id,...result};
  }};
}

function setupRouter(providers:CapabilityProvider[]):CapabilityRouter{
  const registry=new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  providers.forEach(item=>registry.register(item));
  return new CapabilityRouter(registry);
}

describe("V1.13 integrated orchestrator",()=>{
  it("executes dependency order even when steps are listed out of order",async()=>{
    const calls:string[]=[];
    const router=setupRouter([
      provider("calc",["MATH.NUMERICAL_SOLVE"],async()=>{calls.push("calc");return {success:true,output:{value:42},artifactIds:["CALC-1"]};}),
      provider("cad",["CAD.CREATE_PART"],async()=>{calls.push("cad");return {success:true,output:{model:"CAD"},artifactIds:["CAD-1"],evidenceIds:["EV-CAD"]};})
    ]);
    const engine=new EngineeringWorkflowEngine(router);
    const plan={
      id:"WF-1",projectId:"P-1",name:"Design flow",
      steps:[
        {id:"cad",name:"Create CAD",stage:"CAD" as const,capability:"CAD.CREATE_PART",risk:"MEDIUM" as const,input:{},dependsOn:["calc"],requiredRequirementIds:["REQ-1"]},
        {id:"calc",name:"Calculate",stage:"COMPUTATION" as const,capability:"MATH.NUMERICAL_SOLVE",risk:"MEDIUM" as const,input:{}}
      ]
    };
    const project=createProject("P-1");
    project.requirements.push({id:"REQ-1",name:"Requirement",priority:"MUST",status:"SATISFIED"});
    const report=await engine.execute(plan,{project});
    expect(report.status).toBe("COMPLETE");
    expect(calls).toEqual(["calc","cad"]);
    expect(report.traceabilityLinks).toHaveLength(1);
    expect(report.traceabilityLinks[0].to.id).toBe("CAD-1");
  });

  it("blocks unsatisfied requirement gates before capability execution",async()=>{
    let called=false;
    const router=setupRouter([provider("cad",["CAD.CREATE_PART"],async()=>{called=true;return {success:true,artifactIds:["CAD-1"]};})]);
    const project=createProject("P-1");
    project.requirements.push({id:"REQ-1",name:"Requirement",priority:"MUST",status:"OPEN"});
    const report=await new EngineeringWorkflowEngine(router).execute({
      id:"WF-2",projectId:"P-1",name:"Blocked",
      steps:[{id:"cad",name:"Create CAD",stage:"CAD",capability:"CAD.CREATE_PART",risk:"MEDIUM",input:{},requiredRequirementIds:["REQ-1"]}]
    },{project});
    expect(report.status).toBe("BLOCKED");
    expect(called).toBe(false);
  });

  it("enforces explicit human approval gates",async()=>{
    let called=false;
    const router=setupRouter([provider("cad",["CAD.CREATE_PART"],async()=>{called=true;return {success:true};})]);
    const report=await new EngineeringWorkflowEngine(router).execute({
      id:"WF-3",projectId:"P-1",name:"Approval",
      steps:[{id:"cad",name:"Create CAD",stage:"CAD",capability:"CAD.CREATE_PART",risk:"HIGH",input:{},approvalRequired:true,approvalGranted:false}]
    });
    expect(report.status).toBe("BLOCKED");
    expect(called).toBe(false);
  });

  it("uses bounded failure/rework attempts without claiming success early",async()=>{
    let attempts=0;
    const router=setupRouter([provider("calc",["MATH.NUMERICAL_SOLVE"],async()=>{attempts++;return attempts<3?{success:false,error:"solver failed"}:{success:true,output:{value:7}};})]);
    const report=await new EngineeringWorkflowEngine(router).execute({
      id:"WF-4",projectId:"P-1",name:"Retry",
      steps:[{id:"calc",name:"Solve",stage:"COMPUTATION",capability:"MATH.NUMERICAL_SOLVE",risk:"MEDIUM",input:{},maxAttempts:3}]
    });
    expect(report.status).toBe("COMPLETE");
    expect(attempts).toBe(3);
    expect(report.steps[0].attempts).toBe(3);
    expect(report.steps[0].trust).toBe("UNVERIFIED");
  });

  it("blocks an evidence-gated step when the provider returns no evidence",async()=>{
    const router=setupRouter([provider("calc",["MATH.NUMERICAL_SOLVE"],async()=>({success:true,output:{value:5}}))]);
    const report=await new EngineeringWorkflowEngine(router).execute({
      id:"WF-5",projectId:"P-1",name:"Evidence",
      steps:[{id:"calc",name:"Solve",stage:"COMPUTATION",capability:"MATH.NUMERICAL_SOLVE",risk:"MEDIUM",input:{},requireEvidence:true}]
    });
    expect(report.status).toBe("BLOCKED");
    expect(report.steps[0].trust).toBe("UNVERIFIED");
  });

  it("exposes the orchestration provider boundary",async()=>{
    const router=setupRouter([provider("calc",["MATH.NUMERICAL_SOLVE"],async()=>({success:true,output:{value:1},evidenceIds:["EV-1"]}))]);
    const providerInstance=new EngineeringOrchestratorProvider(router);
    const result=await providerInstance.execute({
      capability:"ENGINEERING.ORCHESTRATE_WORKFLOW",
      risk:"HIGH",
      input:{
        plan:{
          id:"WF-6",projectId:"P-1",name:"Provider",
          steps:[{id:"calc",name:"Solve",stage:"COMPUTATION",capability:"MATH.NUMERICAL_SOLVE",risk:"MEDIUM",input:{}}]
        }
      }
    });
    expect(result.success).toBe(true);
    expect((result.output as {status:string}).status).toBe("COMPLETE");
  });
});
