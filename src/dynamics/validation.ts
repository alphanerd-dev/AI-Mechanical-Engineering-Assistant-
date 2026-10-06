import {DynamicsModelValidation,MultibodyDynamicsModel,MultibodyDynamicsResult} from "./types.js";

function hasCycle(model:MultibodyDynamicsModel):boolean{
  const children=new Map<string,string[]>();
  for(const body of model.bodies) children.set(body.id,[]);
  for(const joint of model.joints){
    if(joint.parentBodyId && children.has(joint.parentBodyId)){
      children.get(joint.parentBodyId)!.push(joint.childBodyId);
    }
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

export function validateMultibodyDynamicsModel(model:MultibodyDynamicsModel):DynamicsModelValidation{
  const errors:string[]=[];
  const warnings:string[]=[];
  if(!model.id.trim()) errors.push("Dynamics model id is required.");
  if(!model.name.trim()) errors.push("Dynamics model name is required.");
  if(model.bodies.length===0) errors.push("At least one dynamics body is required.");

  const bodyIds=new Set<string>();
  for(const body of model.bodies){
    if(!body.id.trim()) errors.push("Dynamics body id is required.");
    if(bodyIds.has(body.id)) errors.push(`Duplicate dynamics body id: ${body.id}.`);
    bodyIds.add(body.id);
    if(!body.name.trim()) errors.push(`Dynamics body ${body.id} requires a name.`);
    if(!Number.isFinite(body.massKg)||body.massKg<=0) errors.push(`Dynamics body ${body.id} requires positive finite mass.`);
  }

  const jointIds=new Set<string>();
  for(const joint of model.joints){
    if(!joint.id.trim()) errors.push("Dynamics joint id is required.");
    if(jointIds.has(joint.id)) errors.push(`Duplicate dynamics joint id: ${joint.id}.`);
    jointIds.add(joint.id);
    if(!joint.name.trim()) errors.push(`Dynamics joint ${joint.id} requires a name.`);
    if(joint.parentBodyId===joint.childBodyId) errors.push(`Dynamics joint ${joint.id} cannot connect a body to itself.`);
    if(joint.parentBodyId!==null && !bodyIds.has(joint.parentBodyId))
      errors.push(`Dynamics joint ${joint.id} references missing parent body ${joint.parentBodyId}.`);
    if(!bodyIds.has(joint.childBodyId))
      errors.push(`Dynamics joint ${joint.id} references missing child body ${joint.childBodyId}.`);
  }

  const childCount=new Map<string,number>();
  for(const body of model.bodies) childCount.set(body.id,0);
  for(const joint of model.joints) if(bodyIds.has(joint.childBodyId)) childCount.set(joint.childBodyId,(childCount.get(joint.childBodyId)??0)+1);
  const roots=model.bodies.filter(body=>(childCount.get(body.id)??0)===0);
  if(model.bodies.length>1 && roots.length!==1)
    errors.push(`A multibody tree requires exactly one root body; found ${roots.length}.`);
  if(hasCycle(model)) errors.push("Dynamics body/joint topology contains a cycle.");
  if(model.bodies.length>1 && !model.joints.length) errors.push("Multiple bodies require joints to define connectivity.");
  if(errors.length===0 && model.bodies.length>1) warnings.push("Dynamics model is structurally valid but still requires a numerical solver before results can be treated as engineering results.");
  return {valid:errors.length===0,errors,warnings};
}

export function validateMultibodyDynamicsResult(result:MultibodyDynamicsResult):boolean{
  return Number.isFinite(result.steps) && result.steps>=0 &&
    Number.isInteger(result.steps) &&
    Number.isFinite(result.durationS) && result.durationS>=0 &&
    Array.isArray(result.warnings) &&
    (!result.states || result.states.every(state=>Number.isFinite(state.timeS)));
}
