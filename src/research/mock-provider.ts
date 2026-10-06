import {ResearchProvider,ResearchRequest,ResearchResult} from "./types.js";
import {authorityScore} from "./source-ranking.js";
export class MockResearchProvider implements ResearchProvider{
  readonly id="research.mock"; readonly kind="WEB" as const;
  async search(request:ResearchRequest):Promise<ResearchResult>{
    const sourceClass=request.sourceClasses?.[0] ?? "GENERAL_WEB";
    const source={id:"src-mock-1",title:"Mock engineering source",uri:"https://example.invalid/engineering-source",publisher:"Mock Provider",sourceClass,retrievedAt:new Date().toISOString(),provider:this.id,authorityScore:authorityScore(sourceClass)};
    return {requestId:request.id,provider:this.id,sources:[source],findings:[{id:"finding-mock-1",claim:"This is a provider contract test finding, not real engineering evidence.",sourceIds:[source.id],requirementIds:request.requirementIds,confidence:"LOW",informationStatus:"ASSUMED"}],warnings:["Mock provider output must never be presented as verified engineering evidence."],evidenceIds:[]};
  }
}
