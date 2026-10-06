import {ResearchExtraction,ResearchSource,ResearchSourceInspector} from "./types.js";

export interface SourceDocumentClient {
  fetch(uri:string):Promise<{text:string}>;
}

export class ControlledSourceInspector implements ResearchSourceInspector{
  readonly id="research.source-inspector";

  constructor(private client:SourceDocumentClient){}

  async inspect(source:ResearchSource){
    const document=await this.client.fetch(source.uri);
    const excerpt=document.text.trim();

    if(!excerpt) throw new Error("Inspected source returned no text.");

    return {
      sourceId:source.id,
      excerpt:excerpt.slice(0,10000),
      location:"document"
    };
  }

  async extract(source:ResearchSource):Promise<ResearchExtraction>{
    const inspected=await this.inspect(source);
    return {
      id:`extraction:${source.id}`,
      sourceId:source.id,
      excerpt:inspected.excerpt,
      location:inspected.location,
      extractedAt:new Date().toISOString(),
      extractor:this.id,
      status:"CANDIDATE"
    };
  }
}
