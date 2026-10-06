import {describe,expect,it} from "vitest";
import {ProductModelGraph} from "../src/product-model/graph.js";
import {validateProductModelSnapshot} from "../src/product-model/validation.js";
import {ProductModelProvider} from "../src/providers/product-model.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {V1_22_CAPABILITIES} from "../src/capabilities/v1-22.js";

const now="2026-10-06T19:30:00.000Z";

function node(kind:"PROJECT"|"REQUIREMENT"|"ARTIFACT"|"REVISION"|"EVIDENCE",id:string):{
  ref:{kind:typeof kind;id:string};projectId:string;name:string;
}{
  return {ref:{kind,id},projectId:"P-1",name:id};
}

describe("V1.22 product model graph",()=>{
  it("enforces referential integrity for typed links",()=>{
    const graph=new ProductModelGraph();
    graph.registerNode(node("REQUIREMENT","REQ-1"));
    expect(()=>graph.addLink({id:"L-1",projectId:"P-1",from:node("REQUIREMENT","REQ-1").ref,to:node("ARTIFACT","missing").ref,relation:"IMPLEMENTS",createdAt:now})).toThrow(/not registered/);
  });

  it("rejects cross-project links",()=>{
    const graph=new ProductModelGraph();
    graph.registerNode(node("REQUIREMENT","REQ-1"));
    graph.registerNode({...node("ARTIFACT","A-1"),projectId:"P-2"});
    expect(()=>graph.addLink({id:"L-1",projectId:"P-1",from:node("REQUIREMENT","REQ-1").ref,to:node("ARTIFACT","A-1").ref,relation:"IMPLEMENTS",createdAt:now})).toThrow(/same project/);
  });

  it("stores revisioned decision records and requires approval metadata",()=>{
    const graph=new ProductModelGraph();
    graph.registerNode(node("REQUIREMENT","REQ-1"));
    const proposed={id:"D-1",projectId:"P-1",title:"Choose concept",decision:"Concept A",rationale:"Lower mass",status:"PROPOSED" as const,requirementIds:["REQ-1"],revision:1,createdAt:now,updatedAt:now};
    expect(graph.saveDecision(proposed).revision).toBe(1);
    expect(()=>graph.saveDecision({...proposed,status:"APPROVED" as const,revision:2})).toThrow(/approval/);
    expect(graph.saveDecision({...proposed,status:"APPROVED" as const,revision:2,approvedBy:"Engineer",approvedAt:now}).status).toBe("APPROVED");
  });

  it("validates a complete project snapshot",()=>{
    const graph=new ProductModelGraph();
    graph.registerNode(node("PROJECT","P-1"));
    graph.registerNode(node("REQUIREMENT","REQ-1"));
    graph.registerNode(node("ARTIFACT","A-1"));
    graph.addLink({id:"L-1",projectId:"P-1",from:node("PROJECT","P-1").ref,to:node("REQUIREMENT","REQ-1").ref,relation:"ALLOCATED_TO",createdAt:now});
    graph.addLink({id:"L-2",projectId:"P-1",from:node("REQUIREMENT","REQ-1").ref,to:node("ARTIFACT","A-1").ref,relation:"IMPLEMENTS",createdAt:now});
    const snapshot=graph.snapshot("P-1",1,now);
    expect(validateProductModelSnapshot(snapshot).status).toBe("PASS");
    expect(snapshot.nodes).toHaveLength(3);
    expect(snapshot.links).toHaveLength(2);
  });
});

describe("V1.22 routed product model",()=>{
  it("routes node, link, decision, and model capabilities",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.registerCatalog(V1_22_CAPABILITIES);
    registry.register(new ProductModelProvider());
    const router=new CapabilityRouter(registry);
    const project=node("PROJECT","P-1");
    const req=node("REQUIREMENT","REQ-1");
    const artifact=node("ARTIFACT","A-1");

    expect((await router.execute({capability:"DIGITAL_THREAD.ADD_NODE",risk:"LOW",input:{node:project}})).success).toBe(true);
    expect((await router.execute({capability:"DIGITAL_THREAD.ADD_NODE",risk:"LOW",input:{node:req}})).success).toBe(true);
    expect((await router.execute({capability:"DIGITAL_THREAD.ADD_NODE",risk:"LOW",input:{node:artifact}})).success).toBe(true);
    expect((await router.execute({capability:"DIGITAL_THREAD.ADD_TYPED_LINK",risk:"MEDIUM",input:{link:{id:"L-1",projectId:"P-1",from:project.ref,to:req.ref,relation:"ALLOCATED_TO",createdAt:now}}})).success).toBe(true);
    expect((await router.execute({capability:"DIGITAL_THREAD.ADD_TYPED_LINK",risk:"MEDIUM",input:{link:{id:"L-2",projectId:"P-1",from:req.ref,to:artifact.ref,relation:"IMPLEMENTS",createdAt:now}}})).success).toBe(true);
    const decision=await router.execute({capability:"DIGITAL_THREAD.RECORD_DECISION",risk:"MEDIUM",input:{decision:{id:"D-1",projectId:"P-1",title:"Design choice",decision:"A-1",rationale:"Meets current explicit requirements",status:"PROPOSED",revision:1,requirementIds:["REQ-1"],artifactIds:["A-1"],createdAt:now,updatedAt:now}}});
    expect(decision.success).toBe(true);
    const model=await router.execute({capability:"DIGITAL_THREAD.GET_MODEL",risk:"MEDIUM",input:{projectId:"P-1",revision:1}});
    expect(model.success).toBe(true);
    expect((model.output as any).decisions).toHaveLength(1);
  });
});
