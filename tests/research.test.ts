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
