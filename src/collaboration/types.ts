import {EngineeringWorkspaceSnapshot} from "../workspace/types.js";

export type ProjectMembershipRole="ENGINEER"|"REVIEWER"|"ADMIN"|"AGENT";
export interface EngineeringProjectRecord{ id:string; ownerId:string; name:string; stage:string; status:"ACTIVE"|"BLOCKED"|"COMPLETE"; revision:number; createdAt:string; updatedAt:string; }
export interface ProjectMembershipRecord{ projectId:string; userId:string; role:ProjectMembershipRole; createdAt:string; updatedAt:string; }
export interface DurableWorkspaceRecord{ projectId:string; revision:number; snapshot:EngineeringWorkspaceSnapshot; savedAt:string; }
export interface CollaborationStore{ getProject(projectId:string):Promise<EngineeringProjectRecord|undefined>; listProjectMemberships(projectId:string):Promise<readonly ProjectMembershipRecord[]>; getWorkspace(projectId:string):Promise<DurableWorkspaceRecord|undefined>; saveWorkspace(record:DurableWorkspaceRecord,expectedRevision?:number):Promise<DurableWorkspaceRecord>; }
