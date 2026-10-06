import {describe,expect,it} from "vitest";
import {nextPLMRevisionVersion,transitionPLMRevision} from "../src/plm/workflow.js";
import {analyzePLMChangeImpact} from "../src/plm/impact.js";
import {OdooPLMProvider} from "../src/providers/odoo-plm.js";

const item={id:"PART-1",name:"Bracket",kind:"PART" as const,version:"V1",lifecycleStatus:"RELEASED" as const,projectId:"P-1",artifactIds:["CAD-1"],requirementIds:["REQ-1"],parentItemIds:["ASM-1"]};
const assembly={id:"ASM-1",name:"Assembly",kind:"ASSEMBLY" as const,version:"V3",lifecycleStatus:"RELEASED" as const,projectId:"P-1",componentIds:["PART-1"],requirementIds:["REQ-ASM"],artifactIds:["ASM-CAD"]};

describe("V1.12 PLM workflow",()=>{
  it("increments strict V-number revisions",()=>{
    expect(nextPLMRevisionVersion("V1")).toBe("V2");
    expect(nextPLMRevisionVersion("V9")).toBe("V10");
    expect(()=>nextPLMRevisionVersion("1")).toThrow("V<number>");
  });
  it("requires approval before applying a revision",()=>{
    const revision={
      id:"REV-1",itemId:"PART-1",baseVersion:"V1",version:"V2",
      status:"DRAFT" as const,changeDescription:"Increase wall thickness",
      changes:[{id:"CH-1",type:"UPDATE" as const,itemId:"PART-1",description:"Increase wall thickness"}],
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    };
    expect(()=>transitionPLMRevision(revision,"APPLIED")).toThrow("must be approved");
    const inReview=transitionPLMRevision(revision,"IN_REVIEW");
    const approved=transitionPLMRevision(inReview,"APPROVED");
    const applied=transitionPLMRevision(approved,"APPLIED");
    expect(applied.status).toBe("APPLIED");
  });
});

describe("V1.12 change impact",()=>{
  it("propagates component changes to parent assemblies",()=>{
    const request={
      id:"CR-1",projectId:"P-1",itemId:"PART-1",
      description:"Change bracket thickness",status:"SUBMITTED" as const,
      changes:[{id:"CH-1",type:"UPDATE" as const,itemId:"PART-1",description:"Increase thickness"}],
      createdAt:new Date().toISOString()
    };
    const result=analyzePLMChangeImpact(request,[item,assembly]);
    expect(result.status).toBe("IMPACTED");
    expect(result.impactedItems.map(x=>x.itemId)).toEqual(["ASM-1","PART-1"]);
    expect(result.impactedItems.find(x=>x.itemId==="ASM-1")?.requirementIds).toEqual(["REQ-ASM"]);
  });
  it("fails closed when no change target is supplied",()=>{
    const request={
      id:"CR-2",description:"Missing target",status:"SUBMITTED" as const,
      changes:[],createdAt:new Date().toISOString()
    };
    expect(analyzePLMChangeImpact(request,[item,assembly]).status).toBe("INCOMPLETE");
  });
});

describe("V1.12 Odoo PLM provider boundary",()=>{
  it("queries and validates normalized PLM items",async()=>{
    const provider=new OdooPLMProvider({
      queryItem:async()=>item,
      createRevision:async request=>({
        id:"REV-2",itemId:request.itemId,baseVersion:"V1",version:"V2",
        status:"DRAFT" as const,changeDescription:request.changeDescription,
        changes:request.changes??[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
      })
    });
    const result=await provider.execute({capability:"PLM.QUERY_ITEM",risk:"LOW",input:{itemId:"PART-1"}});
    expect(result.success).toBe(true);
    expect((result.output as {id:string}).id).toBe("PART-1");
  });
  it("rejects a revision returned with a stale base version",async()=>{
    const provider=new OdooPLMProvider({
      queryItem:async()=>item,
      createRevision:async request=>({
        id:"REV-3",itemId:request.itemId,baseVersion:"V0",version:"V1",
        status:"DRAFT" as const,changeDescription:request.changeDescription,
        changes:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
      })
    });
    const result=await provider.execute({capability:"PLM.CREATE_REVISION",risk:"HIGH",input:{itemId:"PART-1",changeDescription:"Change bracket"}});
    expect(result.success).toBe(false);
    expect(result.error).toContain("base version does not match");
  });
});
