import {EngineeringRequirement,RequirementTrace} from "./types.js";

export class RequirementTraceability {
  private readonly requirements=new Map<string,EngineeringRequirement>();
  private readonly traces:RequirementTrace[]=[];

  addRequirement(requirement:EngineeringRequirement){
    if(this.requirements.has(requirement.id)) throw new Error("Requirement already exists: "+requirement.id);
    this.requirements.set(requirement.id,structuredClone(requirement));
  }

  updateRequirement(requirement:EngineeringRequirement){
    if(!this.requirements.has(requirement.id)) throw new Error("Requirement not found: "+requirement.id);
    this.requirements.set(requirement.id,structuredClone(requirement));
  }

  get(id:string){ return this.requirements.get(id); }
  all(){ return [...this.requirements.values()].map(r=>structuredClone(r)); }

  trace(trace:RequirementTrace){
    if(!this.requirements.has(trace.fromId)||!this.requirements.has(trace.toId)) throw new Error("Both requirements must exist before tracing.");
    if(trace.fromId===trace.toId) throw new Error("A requirement cannot trace to itself.");
    if(trace.relation==="CONSTRAINS" && this.constrainsPath(trace.toId,trace.fromId)){
      throw new Error("A CONSTRAINS trace cannot create a requirement dependency cycle.");
    }
    const duplicate=this.traces.some(t=>t.fromId===trace.fromId&&t.toId===trace.toId&&t.relation===trace.relation);
    if(!duplicate) this.traces.push(structuredClone(trace));
  }


  private constrainsPath(fromId:string,toId:string,visited=new Set<string>()):boolean{
    if(fromId===toId) return true;
    if(visited.has(fromId)) return false;
    visited.add(fromId);
    return this.traces
      .filter(t=>t.relation==="CONSTRAINS"&&t.fromId===fromId)
      .some(t=>this.constrainsPath(t.toId,toId,visited));
  }

  tracesFor(id:string){ return this.traces.filter(t=>t.fromId===id||t.toId===id).map(t=>structuredClone(t)); }

  blockers(id:string){
    const requirement=this.requirements.get(id);
    if(!requirement) throw new Error("Requirement not found: "+id);
    return this.traces.filter(t=>t.toId===id&&t.relation==="CONSTRAINS").map(t=>this.requirements.get(t.fromId)).filter(Boolean) as EngineeringRequirement[];
  }
}