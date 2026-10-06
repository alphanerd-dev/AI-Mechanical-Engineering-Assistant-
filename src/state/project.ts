import {ProjectState, Requirement, EngineeringEvent} from "../core/types";

export function createProject(name:string):ProjectState {
  return {id:crypto.randomUUID(),name,stage:"PROBLEM",status:"ACTIVE",requirements:[],
    assumptions:[],openQuestions:[],unresolvedRisks:[],events:[]};
}
export function addRequirement(state:ProjectState, req:Requirement):void { state.requirements.push(req); }
export function recordEvent(state:ProjectState,event:Omit<EngineeringEvent,"id"|"timestamp">):void {
  state.events.push({...event,id:crypto.randomUUID(),timestamp:new Date().toISOString()});
}
