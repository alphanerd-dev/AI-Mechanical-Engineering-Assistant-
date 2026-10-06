import {PLMChangeRequest,PLMImpact,PLMImpactAnalysis,PLMItem} from "./types.js";
import {validatePLMItem} from "./validation.js";

export function analyzePLMChangeImpact(request:PLMChangeRequest,items:PLMItem[]):PLMImpactAnalysis{
  const warnings:string[]=[];
  if(!request.id.trim()) return {changeRequestId:request.id,status:"INCOMPLETE",impactedItems:[],warnings:["Change request id is required."]};
  if(!request.description.trim()) return {changeRequestId:request.id,status:"INCOMPLETE",impactedItems:[],warnings:["Change request description is required."]};
  const byId=new Map(items.map(item=>[item.id,item]));
  for(const item of items){
    const validation=validatePLMItem(item);
    if(!validation.valid) warnings.push(...validation.errors.map(error=>`${item.id}: ${error}`));
  }
  const targets=new Set<string>();
  if(request.itemId) targets.add(request.itemId);
  for(const change of request.changes) if(change.itemId.trim()) targets.add(change.itemId);
  if(targets.size===0) return {changeRequestId:request.id,status:"INCOMPLETE",impactedItems:[],warnings:[...warnings,"At least one changed PLM item is required."]};
  const direct=[...targets];
  const reasonMap=new Map<string,string[]>();
  const visitQueue=[...targets];
  const visited=new Set<string>();
  while(visitQueue.length){
    const id=visitQueue.shift()!;
    if(visited.has(id)) continue;
    visited.add(id);
    const item=byId.get(id);
    if(!item){
      warnings.push(`Changed PLM item not found: ${id}.`);
      continue;
    }
    const reasons=reasonMap.get(id)??[];
    if(targets.has(id)&&!reasons.includes("Directly changed")) reasons.push("Directly changed");
    reasonMap.set(id,reasons);
    for(const parent of item.parentItemIds??[]){
      const parentReasons=reasonMap.get(parent)??[];
      const reason=`Depends on changed item ${id} through PLM parent relationship`;
      if(!parentReasons.includes(reason)) parentReasons.push(reason);
      reasonMap.set(parent,parentReasons);
      if(!visited.has(parent)) visitQueue.push(parent);
    }
  }
  const impactedItems:PLMImpact[]=[];
  for(const id of visited){
    const item=byId.get(id);
    if(!item) continue;
    impactedItems.push({
      itemId:item.id,
      itemName:item.name,
      reasons:reasonMap.get(id)??[],
      requirementIds:[...(item.requirementIds??[])],
      artifactIds:[...(item.artifactIds??[])]
    });
  }
  impactedItems.sort((a,b)=>a.itemId.localeCompare(b.itemId));
  const status=impactedItems.length>direct.length||warnings.some(w=>w.startsWith("Changed PLM item not found:"))
    ?"IMPACTED":"SAFE";
  return {changeRequestId:request.id,status,impactedItems,warnings};
}
