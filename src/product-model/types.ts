export const PRODUCT_MODEL_SCHEMA_VERSION=1 as const;

export type ProductModelNodeKind=
  "PROJECT"|"REQUIREMENT"|"SYSTEM"|"ARTIFACT"|"REVISION"|"CHANGE_REQUEST"|"BOM"|"PROCESS_PLAN"|
  "SIMULATION"|"RESEARCH"|"EVIDENCE"|"DECISION";

export type ProductModelRelation=
  "DERIVES_FROM"|"ALLOCATED_TO"|"SATISFIES"|"CONSTRAINS"|"IMPLEMENTS"|"REPRESENTS"|
  "REVISES"|"SUPERSEDES"|"AFFECTS"|"VERIFIED_BY";

export interface ProductModelNodeRef{
  kind:ProductModelNodeKind;
  id:string;
}

export interface ProductModelNode{
  ref:ProductModelNodeRef;
  projectId:string;
  name:string;
  version?:string;
  metadata?:Record<string,string|number|boolean>;
}

export interface ProductModelLink{
  id:string;
  projectId:string;
  from:ProductModelNodeRef;
  to:ProductModelNodeRef;
  relation:ProductModelRelation;
  evidenceIds?:string[];
  createdAt:string;
}

export type EngineeringDecisionStatus="PROPOSED"|"APPROVED"|"REJECTED"|"SUPERSEDED";

export interface EngineeringDecisionRecord{
  id:string;
  projectId:string;
  title:string;
  decision:string;
  rationale:string;
  status:EngineeringDecisionStatus;
  optionIds?:string[];
  selectedOptionId?:string;
  requirementIds?:string[];
  artifactIds?:string[];
  evidenceIds?:string[];
  approvedBy?:string;
  approvedAt?:string;
  revision:number;
  createdAt:string;
  updatedAt:string;
}

export interface ProductModelSnapshot{
  schemaVersion:typeof PRODUCT_MODEL_SCHEMA_VERSION;
  projectId:string;
  revision:number;
  nodes:ProductModelNode[];
  links:ProductModelLink[];
  decisions:EngineeringDecisionRecord[];
  savedAt:string;
}
