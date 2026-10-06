import {describe,expect,it} from "vitest";
import {RequirementTraceability} from "../src/requirements/traceability.js";

describe("requirement traceability",()=>{
 it("requires existing endpoints and rejects self-traces",()=>{
  const graph=new RequirementTraceability();
  graph.addRequirement({id:"SYS-1",name:"System",statement:"The system shall operate safely.",kind:"SYSTEM",priority:"MUST",status:"OPEN"});
  graph.addRequirement({id:"REQ-1",name:"Load",statement:"The component shall carry the design load.",kind:"ENGINEERING",priority:"MUST",status:"OPEN",parentId:"SYS-1"});
  graph.trace({fromId:"REQ-1",toId:"SYS-1",relation:"DERIVES_FROM"});
  expect(graph.tracesFor("SYS-1")).toHaveLength(1);
  expect(()=>graph.trace({fromId:"REQ-1",toId:"REQ-1",relation:"SATISFIES"})).toThrow();

  it("rejects CONSTRAINS dependency cycles",()=>{
    const graph=new RequirementTraceability();
    for(const id of ["REQ-A","REQ-B","REQ-C"]){
      graph.addRequirement({id,name:id,statement:id,kind:"ENGINEERING",priority:"MUST",status:"OPEN"});
    }
    graph.trace({fromId:"REQ-A",toId:"REQ-B",relation:"CONSTRAINS"});
    graph.trace({fromId:"REQ-B",toId:"REQ-C",relation:"CONSTRAINS"});
    expect(()=>graph.trace({fromId:"REQ-C",toId:"REQ-A",relation:"CONSTRAINS"})).toThrow("dependency cycle");
  });
 });
});
