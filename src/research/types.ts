export type ResearchSourceClass="STANDARD"|"MANUFACTURER"|"PEER_REVIEWED"|"TEXTBOOK"|"PATENT"|"ENGINEERING_ORG"|"GENERAL_WEB";
export type ResearchConfidence="LOW"|"MEDIUM"|"HIGH"|"VERIFIED";
export type ResearchProviderKind="ACADEMIC"|"MANUFACTURER"|"WEB"|"INTERNAL";
export interface ResearchRequest { id:string; question:string; projectId?:string; requirementIds?:string[]; sourceClasses?:ResearchSourceClass[]; maxSources?:number; }
export interface ResearchSource { id:string; title:string; uri:string; publisher?:string; sourceClass:ResearchSourceClass; publishedAt?:string; retrievedAt:string; provider:string; authorityScore:number; }
export interface ResearchFinding { id:string; claim:string; interpretation?:string; sourceIds:string[]; requirementIds?:string[]; confidence:ResearchConfidence; informationStatus:"KNOWN"|"ASSUMED"|"ESTIMATED"|"VERIFIED"; }
export interface ResearchResult { requestId:string; provider:string; sources:ResearchSource[]; findings:ResearchFinding[]; warnings:string[]; evidenceIds:string[]; }
export interface ResearchProvider { readonly id:string; readonly kind:ResearchProviderKind; search(request:ResearchRequest):Promise<ResearchResult>; }
