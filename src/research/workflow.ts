import {ResearchEngine} from "./engine.js";
import {ResearchSourceInspector,ResearchRequest,ResearchResult,ResearchExtraction} from "./types.js";

export interface ResearchWorkflowResult extends ResearchResult {
  extractions:ResearchExtraction[];
}

export class ResearchWorkflow {
  constructor(
    private readonly engine:ResearchEngine,
    private readonly inspector:ResearchSourceInspector
  ){}

  async run(request:ResearchRequest):Promise<ResearchWorkflowResult>{
    const result=await this.engine.search(request);
    const extractions:ResearchExtraction[]=[];

    for(const source of result.sources){
      const inspected=await this.inspector.inspect(source);
      extractions.push({
        id:`extraction:${source.id}`,
        sourceId:source.id,
        excerpt:inspected.excerpt,
        location:inspected.location,
        extractedAt:new Date().toISOString(),
        extractor:this.inspector.id,
        status:"CANDIDATE"
      });
    }

    const extractionBySource=new Map(extractions.map(e=>[e.sourceId,e.id]));
    const findings=result.findings.map(f=>({
      ...f,
      extractionId:f.extractionId??f.sourceIds.map(id=>extractionBySource.get(id)).find(Boolean)
    }));

    return {...result,findings,extractions};
  }
}
