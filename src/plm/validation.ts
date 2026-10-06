import {PLMItem,PLMRevision} from "./types.js";

export function validatePLMItem(item:PLMItem):{valid:boolean;errors:string[];warnings:string[]}{
  const errors:string[]=[];
  const warnings:string[]=[];
  if(!item.id.trim()) errors.push("PLM item id is required.");
  if(!item.name.trim()) errors.push("PLM item name is required.");
  if(!item.version.trim()) errors.push("PLM item version is required.");
  if(item.projectId!==undefined&&!item.projectId.trim()) errors.push("PLM project id cannot be blank.");
  for(const id of item.artifactIds??[]) if(!id.trim()) errors.push("PLM artifact ids cannot be blank.");
  for(const id of item.requirementIds??[]) if(!id.trim()) errors.push("PLM requirement ids cannot be blank.");
  for(const id of item.componentIds??[]) if(!id.trim()) errors.push("PLM component ids cannot be blank.");
  for(const id of item.parentItemIds??[]) if(!id.trim()) errors.push("PLM parent item ids cannot be blank.");
  if(item.lifecycleStatus==="RELEASED"&&!(item.artifactIds?.length||item.requirementIds?.length))
    warnings.push("Released PLM item has no linked engineering artifacts or requirements.");
  return {valid:errors.length===0,errors,warnings};
}

export function validatePLMRevision(revision:PLMRevision):{valid:boolean;errors:string[];warnings:string[]}{
  const errors:string[]=[];
  const warnings:string[]=[];
  if(!revision.id.trim()) errors.push("PLM revision id is required.");
  if(!revision.itemId.trim()) errors.push("PLM revision item id is required.");
  if(!revision.baseVersion.trim()) errors.push("PLM base version is required.");
  if(!revision.version.trim()) errors.push("PLM revision version is required.");
  if(!revision.changeDescription.trim()) errors.push("PLM change description is required.");
  if(revision.version===revision.baseVersion) errors.push("PLM revision version must differ from the base version.");
  const changeIds=new Set<string>();
  for(const change of revision.changes){
    if(!change.id.trim()) errors.push("PLM change id is required.");
    if(changeIds.has(change.id)) errors.push(`Duplicate PLM change id: ${change.id}.`);
    changeIds.add(change.id);
    if(change.itemId!==revision.itemId) warnings.push(`Change ${change.id} targets item ${change.itemId}, outside revision item ${revision.itemId}.`);
    if(!change.description.trim()) errors.push(`PLM change description is required: ${change.id}.`);
  }
  for(const id of revision.artifactIds??[]) if(!id.trim()) errors.push("PLM revision artifact ids cannot be blank.");
  for(const id of revision.requirementIds??[]) if(!id.trim()) errors.push("PLM revision requirement ids cannot be blank.");
  return {valid:errors.length===0,errors,warnings};
}
