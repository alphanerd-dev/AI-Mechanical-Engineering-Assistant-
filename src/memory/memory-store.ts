import {EngineeringEvent, ProjectState} from "../core/types.js";

export class EngineeringMemory {
  private projects = new Map<string,ProjectState>();
  save(project:ProjectState){this.projects.set(project.id,structuredClone(project));}
  get(id:string){return this.projects.get(id);}
  events(id:string):EngineeringEvent[]{return this.projects.get(id)?.events ?? [];}
}
