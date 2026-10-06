import {SystemElement,SystemModel} from "./types.js";

export class EngineeringSystemModel {
  constructor(private readonly model:SystemModel){}
  addElement(element:SystemElement){
    if(this.model.elements.some(e=>e.id===element.id)) throw new Error("System element already exists: "+element.id);
    if(element.parentId && !this.model.elements.some(e=>e.id===element.parentId)) throw new Error("Parent system element not found.");
    this.model.elements.push(structuredClone(element));
  }
  allocateRequirement(requirementId:string,elementId:string){
    const element=this.model.elements.find(e=>e.id===elementId);
    if(!element) throw new Error("System element not found: "+elementId);
    if(!this.model.requirements.some(r=>r.id===requirementId)) throw new Error("Requirement not found: "+requirementId);
    if(!element.requirementIds.includes(requirementId)) element.requirementIds.push(requirementId);
  }
  get(){ return structuredClone(this.model); }
}
