import {EngineeringEvent, ProjectState} from "../core/types.js";
import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";

export class EngineeringMemory {
  private projects = new Map<string,ProjectState>();
  private evidence = new Map<string,EvidenceRecord>();
  private requirementEvidence = new Map<string,string[]>();

  save(project:ProjectState){this.projects.set(project.id,structuredClone(project));}
  get(id:string){return this.projects.get(id);}
  events(id:string):EngineeringEvent[]{return this.projects.get(id)?.events ?? [];}

  saveEvidence(projectId:string,evidence:EvidenceRecord){
    if(evidence.status!=="VERIFIED") throw new Error("Only VERIFIED evidence may be stored in engineering memory.");
    this.evidence.set(evidence.id,structuredClone(evidence));
    const project=this.projects.get(projectId);
    if(project){
      project.evidenceIds ??=[];
      if(!project.evidenceIds.includes(evidence.id)) project.evidenceIds.push(evidence.id);
    }
  }

  getEvidence(id:string){return this.evidence.get(id);}

  linkEvidence(projectId:string,requirementId:string,evidenceId:string){
    if(!this.evidence.has(evidenceId)) throw new Error("Evidence must be stored before linking it.");
    const key=`${projectId}:${requirementId}`;
    const ids=this.requirementEvidence.get(key)??[];
    if(!ids.includes(evidenceId)) ids.push(evidenceId);
    this.requirementEvidence.set(key,ids);
  }

  evidenceForRequirement(projectId:string,requirementId:string){
    return (this.requirementEvidence.get(`${projectId}:${requirementId}`)??[])
      .map(id=>this.evidence.get(id)).filter(Boolean) as EvidenceRecord[];
  }
}
