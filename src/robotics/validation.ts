import {RoboticsAsset,RoboticsAssetValidation} from "./types.js";

function hasTreeCycle(asset:RoboticsAsset):boolean{
  const children=new Map<string,string[]>();
  for(const link of asset.links) children.set(link.id,[]);
  for(const joint of asset.joints){
    if(children.has(joint.parentLinkId)) children.get(joint.parentLinkId)!.push(joint.childLinkId);
  }
  const visiting=new Set<string>();
  const visited=new Set<string>();
  const visit=(id:string):boolean=>{
    if(visiting.has(id)) return true;
    if(visited.has(id)) return false;
    visiting.add(id);
    for(const child of children.get(id)??[]) if(visit(child)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...children.keys()].some(visit);
}

export function validateRoboticsAsset(asset:RoboticsAsset):RoboticsAssetValidation{
  const errors:string[]=[];
  const warnings:string[]=[];
  if(!asset.id.trim()) errors.push("Robotics asset id is required.");
  if(!asset.name.trim()) errors.push("Robotics asset name is required.");
  if(asset.links.length===0) errors.push("At least one robotics link is required.");
  const linkIds=new Set<string>();
  for(const link of asset.links){
    if(!link.id.trim()) errors.push("Robotics link id is required.");
    if(linkIds.has(link.id)) errors.push(`Duplicate robotics link id: ${link.id}.`);
    linkIds.add(link.id);
    if(!link.name.trim()) errors.push(`Robotics link ${link.id} requires a name.`);
    if(link.massKg!==undefined && (!Number.isFinite(link.massKg)||link.massKg<0))
      errors.push(`Robotics link ${link.id} has an invalid mass.`);
  }

  const jointIds=new Set<string>();
  const parentCount=new Map<string,number>();
  for(const link of asset.links) parentCount.set(link.id,0);
  for(const joint of asset.joints){
    if(!joint.id.trim()) errors.push("Robotics joint id is required.");
    if(jointIds.has(joint.id)) errors.push(`Duplicate robotics joint id: ${joint.id}.`);
    jointIds.add(joint.id);
    if(!joint.name.trim()) errors.push(`Robotics joint ${joint.id} requires a name.`);
    if(!linkIds.has(joint.parentLinkId)) errors.push(`Joint ${joint.id} references missing parent link ${joint.parentLinkId}.`);
    if(!linkIds.has(joint.childLinkId)) errors.push(`Joint ${joint.id} references missing child link ${joint.childLinkId}.`);
    if(joint.parentLinkId===joint.childLinkId) errors.push(`Joint ${joint.id} cannot connect a link to itself.`);
    if(asset.topology==="TREE" && linkIds.has(joint.childLinkId))
      parentCount.set(joint.childLinkId,(parentCount.get(joint.childLinkId)??0)+1);
  }

  if(asset.rootLinkId!==undefined && !linkIds.has(asset.rootLinkId))
    errors.push(`Robotics asset root link ${asset.rootLinkId} does not exist.`);

  if(asset.topology==="TREE"){
    if(asset.links.length>1 && !asset.rootLinkId) errors.push("Tree robotics assets require an explicit root link.");
    if(asset.rootLinkId && (parentCount.get(asset.rootLinkId)??0)!==0) errors.push("Tree root link cannot have a parent joint.");
    for(const link of asset.links){
      if(link.id!==asset.rootLinkId && (parentCount.get(link.id)??0)!==1)
        errors.push(`Tree link ${link.id} must have exactly one parent joint.`);
    }
    if(hasTreeCycle(asset)) errors.push("Robotics asset topology contains a cycle.");
  }else if(asset.links.length>0 && !asset.rootLinkId){
    warnings.push("Graph robotics assets do not require a root link.");
  }

  return {valid:errors.length===0,errors,warnings};
}
