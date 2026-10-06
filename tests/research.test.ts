import {describe,expect,it} from "vitest";
import {ResearchEngine} from "../src/research/engine.js";
import {MockResearchProvider} from "../src/research/mock-provider.js";
describe("research engine",()=>{
  it("ranks higher-authority source classes first",async()=>{
    const result=await new ResearchEngine([new MockResearchProvider()]).search({id:"req-1",question:"What material properties matter for a shaft?",sourceClasses:["MANUFACTURER"],maxSources:5});
    expect(result.sources[0].authorityScore).toBe(0.95);
    expect(result.findings[0].informationStatus).toBe("ASSUMED");
  });
  it("rejects an empty research question",async()=>{
    await expect(new ResearchEngine([new MockResearchProvider()]).search({id:"req-2",question:"  "})).rejects.toThrow();
  });
});


import {ControlledSourceInspector} from "../src/research/inspector.js";

describe("research source inspection",()=>{
  it("creates a candidate extraction from inspected source text",async()=>{
    const inspector=new ControlledSourceInspector({
      async fetch(){ return {text:"Yield strength is a critical material property for shaft design."}; }
    });
    const source={
      id:"src-1",title:"Engineering reference",uri:"https://example.test/reference",
      sourceClass:"TEXTBOOK" as const,retrievedAt:new Date().toISOString(),
      provider:"test",authorityScore:0.88
    };
    const extraction=await inspector.extract(source);
    expect(extraction.sourceId).toBe("src-1");
    expect(extraction.excerpt).toContain("Yield strength");
    expect(extraction.status).toBe("CANDIDATE");
  });

  it("fails closed when inspected source has no text",async()=>{
    const inspector=new ControlledSourceInspector({
      async fetch(){ return {text:"   "}; }
    });
    const source={
      id:"src-empty",title:"Empty",uri:"https://example.test/empty",
      sourceClass:"GENERAL_WEB" as const,retrievedAt:new Date().toISOString(),
      provider:"test",authorityScore:0.45
    };
    await expect(inspector.inspect(source)).rejects.toThrow("no text");
  });
});
