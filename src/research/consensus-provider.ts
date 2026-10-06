import {ResearchProvider,ResearchRequest,ResearchResult} from "./types.js";
import {authorityScore} from "./source-ranking.js";

export interface ConsensusClient {
  search(query:string):Promise<Array<{id:string;title:string;url:string;text:string;year?:number;authors?:string[]}>>;
  fetch(id:string):Promise<{title:string;url:string;text?:string;year?:number;authors?:string[];journal?:string;citationCount?:number}>;
}

export class ConsensusResearchProvider implements ResearchProvider{
  readonly id="research.consensus";
  readonly kind="ACADEMIC" as const;
  constructor(private client:ConsensusClient){}
  async search(request:ResearchRequest):Promise<ResearchResult>{
    const hits=await this.client.search(request.question);
    const selected=hits.slice(0,request.maxSources??10);
    const sources=selected.map(h=>({id:"consensus:"+h.id,title:h.title,uri:h.url,publisher:"Consensus",sourceClass:"PEER_REVIEWED" as const,publishedAt:h.year?String(h.year):undefined,retrievedAt:new Date().toISOString(),provider:this.id,authorityScore:authorityScore("PEER_REVIEWED")}));
    const findings=selected.map((h,i)=>({id:"finding:"+h.id,claim:h.text,sourceIds:[sources[i].id],requirementIds:request.requirementIds,confidence:"MEDIUM" as const,informationStatus:"KNOWN" as const}));
    return {requestId:request.id,provider:this.id,sources,findings,warnings:["Academic search results are evidence candidates; critical engineering inputs require source-level verification."],evidenceIds:[]};
  }
}
