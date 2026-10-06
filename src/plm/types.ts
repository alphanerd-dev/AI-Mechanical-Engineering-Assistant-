export type PLMItemKind="PART"|"ASSEMBLY"|"PRODUCT"|"DOCUMENT"|"BOM";
export type PLMLifecycleStatus="DRAFT"|"IN_REVIEW"|"RELEASED"|"OBSOLETE"|"REJECTED"|"ARCHIVED";
export type PLMRevisionStatus="DRAFT"|"IN_REVIEW"|"APPROVED"|"REJECTED"|"APPLIED";
export type PLMChangeType="ADD"|"REMOVE"|"UPDATE"|"REPLACE";
export type PLMChangeRequestStatus="DRAFT"|"SUBMITTED"|"APPROVED"|"REJECTED"|"IMPLEMENTED";

export interface PLMItem{
  id:string;
  name:string;
  kind:PLMItemKind;
  version:string;
  lifecycleStatus:PLMLifecycleStatus;
  projectId?:string;
  artifactIds?:string[];
  requirementIds?:string[];
  componentIds?:string[];
  parentItemIds?:string[];
}

export interface PLMChange{
  id:string;
  type:PLMChangeType;
  itemId:string;
  description:string;
}

export interface PLMRevision{
  id:string;
  itemId:string;
  baseVersion:string;
  version:string;
  status:PLMRevisionStatus;
  changeDescription:string;
  changes:PLMChange[];
  projectId?:string;
  artifactIds?:string[];
  requirementIds?:string[];
  evidenceIds?:string[];
  createdAt:string;
  updatedAt:string;
}

export interface PLMChangeRequest{
  id:string;
  projectId?:string;
  itemId?:string;
  description:string;
  status:PLMChangeRequestStatus;
  revisionId?:string;
  changes:PLMChange[];
  createdAt:string;
}

export interface PLMRevisionRequest{
  itemId:string;
  projectId?:string;
  changeDescription:string;
  changes?:PLMChange[];
}

export interface PLMImpact{
  itemId:string;
  itemName:string;
  reasons:string[];
  requirementIds:string[];
  artifactIds:string[];
}

export interface PLMImpactAnalysis{
  changeRequestId:string;
  status:"SAFE"|"IMPACTED"|"INCOMPLETE";
  impactedItems:PLMImpact[];
  warnings:string[];
}
