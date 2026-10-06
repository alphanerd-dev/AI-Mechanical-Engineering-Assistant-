import {ResearchProvider,ResearchRequest,ResearchResult,ResearchSourceClass} from "./types";
import {authorityScore} from "./source-ranking";

export interface WebResearchClient {
  search(query:string):Promise<Array<{url:string;title:string;description?:string;domain?:string}>>;
}

export class ControlledWebResearchProvider implements ResearchProvider{
  readonly id="research.controlled-web";
  readonly kind="WEB" as const;
  constructor(private client:WebResearchClient){}
  async search(request:ResearchRequest):Promise<ResearchResult>{
    const hits=await this.client.search(request.question);
    const allowed=request.sourceClasses ?? ["GENERAL_WEB"];
    const sourceClass:ResearchSourceClass=allowed.includes("MANUFACTURER")?"MANUFACTURER":"GENERAL_WEB";
    const sources=hits.slice(0,request.maxSources??10).map((h,i)=>({id:"web:"+i+":"+encodeURIComponent(h.url),title:h.title,uri:h.url,publisher:h.domain,sourceClass,retrievedAt:new Date().toISOString(),provider:this.id,authorityScore:authorityScore(sourceClass)}));
    return {requestId:request.id,provider:this.id,sources,findings:sources.map(s=>({id:"finding:"+s.id,claim:"Source candidate: "+s.title,sourceIds:[s.id],requirementIds:request.requirementIds,confidence:"LOW" as const,informationStatus:"ASSUMED" as const})),warnings:["Web results are source candidates until the underlying page is retrieved and evaluated."],evidenceIds:[]};
  }
}
