import {describe,expect,it} from "vitest";
import {ResearchEngine} from "../src/research/engine.js";
import {MockResearchProvider} from "../src/research/mock-provider.js";
import {ResearchWorkflow} from "../src/research/workflow.js";

describe("research workflow",()=>{
  it("connects discovery, source inspection, extraction, and finding provenance",async()=>{
    const inspector={
      id:"test.inspector",
      async inspect(source:any){
        return {
          sourceId:source.id,
          excerpt:"Inspected engineering evidence.",
          location:"page 12"
        };
      }
    };
    const result=await new ResearchWorkflow(
      new ResearchEngine([new MockResearchProvider()]),
      inspector
    ).run({
      id:"workflow-1",
      question:"What evidence matters for shaft design?",
      maxSources:1
    });

    expect(result.sources).toHaveLength(1);
    expect(result.extractions).toHaveLength(1);
    expect(result.extractions[0].status).toBe("CANDIDATE");
    expect(result.findings[0].extractionId).toBe(result.extractions[0].id);
    expect(result.findings[0].informationStatus).toBe("ASSUMED");
  });

  it("does not silently verify inspected research",async()=>{
    const result=await new ResearchWorkflow(
      new ResearchEngine([new MockResearchProvider()]),
      {
        id:"test.inspector",
        async inspect(source:any){
          return {sourceId:source.id,excerpt:"Candidate evidence.",location:"document"};
        }
      }
    ).run({
      id:"workflow-2",
      question:"Test research question",
      maxSources:1
    });

    expect(result.extractions[0].status).toBe("CANDIDATE");
    expect(result.findings[0].informationStatus).toBe("ASSUMED");
  });
});
