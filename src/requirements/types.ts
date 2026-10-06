export type RequirementKind="STAKEHOLDER"|"SYSTEM"|"ENGINEERING"|"INTERFACE"|"VERIFICATION";
export type RequirementStatus="DRAFT"|"OPEN"|"SATISFIED"|"BLOCKED"|"RETIRED";
export interface EngineeringRequirement {
  id:string; name:string; statement:string; kind:RequirementKind;
  priority:"MUST"|"SHOULD"|"COULD";
  value?:number|string; unit?:string; tolerance?:number|string;
  verificationMethod?:string; status:RequirementStatus;
  sourceIds?:string[]; parentId?:string; tags?:string[];
}
export interface RequirementTrace {
  fromId:string; toId:string;
  relation:"DERIVES_FROM"|"SATISFIES"|"VERIFIED_BY"|"CONSTRAINS"|"ALLOCATED_TO";
  evidenceIds?:string[];
}
export interface RequirementSet {
  projectId:string; requirements:EngineeringRequirement[]; traces:RequirementTrace[];
}