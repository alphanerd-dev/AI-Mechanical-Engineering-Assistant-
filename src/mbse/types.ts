import {EngineeringRequirement} from "../requirements/types.js";
export interface SystemElement { id:string; name:string; type:"SYSTEM"|"SUBSYSTEM"|"COMPONENT"|"INTERFACE"; parentId?:string; requirementIds:string[]; }
export interface SystemModel { id:string; name:string; elements:SystemElement[]; requirements:EngineeringRequirement[]; }
