import {ResearchProvider,ResearchRequest,ResearchResult} from "./types.js";
import {rankSources} from "./source-ranking.js";
export class ResearchEngine{
  constructor(private providers:ResearchProvider[]){}
  async search(request:ResearchRequest):Promise<ResearchResult>{
    if(!request.question.trim()) throw new Error("Research question is required.");
    if(!this.providers.length) throw new Error("No research providers are registered.");
    const results=await Promise.all(this.providers.map(p=>p.search(request)));
    const sources=rankSources(results.flatMap(r=>r.sources));
    return {requestId:request.id,provider:this.providers.map(p=>p.id).join(","),sources:sources.slice(0,request.maxSources??10),findings:results.flatMap(r=>r.findings),warnings:results.flatMap(r=>r.warnings),evidenceIds:results.flatMap(r=>r.evidenceIds)};
  }
}
