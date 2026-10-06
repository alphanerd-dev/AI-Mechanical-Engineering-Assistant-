import {MultibodyDynamicsModel} from "./types.js";

export interface InverseDynamicsInput{
  model:MultibodyDynamicsModel;
  positions:Record<string,number>;
  velocities:Record<string,number>;
  accelerations:Record<string,number>;
  gravityMps2?:{x:number;y:number;z:number};
}

export interface InverseDynamicsResult{
  solver:string;
  generalizedForces:Record<string,number>;
  dofOrder:string[];
  warnings:string[];
}

export interface InverseDynamicsValidation{
  valid:boolean;
  errors:string[];
  warnings:string[];
}

export function validateInverseDynamicsInput(input:InverseDynamicsInput):InverseDynamicsValidation{
  const errors:string[]=[];
  const warnings:string[]=[];

  if(!input||!input.model)errors.push("An inverse-dynamics model is required.");

  if(input){
    for(const [name,values] of [["positions",input.positions],["velocities",input.velocities],["accelerations",input.accelerations]] as const){
      if(!values||typeof values!=="object")errors.push(name+" are required.");
      else for(const [key,value] of Object.entries(values))
        if(!Number.isFinite(value))errors.push(name+"["+key+"] must be finite.");
    }

    for(const vectorName of ["gravityMps2"] as const){
      const vector=input[vectorName];
      if(vector&&(!Number.isFinite(vector.x)||!Number.isFinite(vector.y)||!Number.isFinite(vector.z)))
        errors.push(vectorName+" must contain finite components.");
    }

    if(input.model){
      const jointIds=new Set(input.model.joints.map(joint=>joint.id));
      const dynamicJoints=input.model.joints.filter(joint=>joint.type!=="FIXED");
      for(const joint of dynamicJoints){
        if(!Number.isFinite(input.positions?.[joint.id]))errors.push("Missing position for joint "+joint.id+".");
        if(!Number.isFinite(input.velocities?.[joint.id]))errors.push("Missing velocity for joint "+joint.id+".");
        if(!Number.isFinite(input.accelerations?.[joint.id]))errors.push("Missing acceleration for joint "+joint.id+".");
      }
      for(const key of Object.keys(input.positions??{}))
        if(!jointIds.has(key))warnings.push("Position input includes an unused joint key: "+key+".");
    }
  }

  return {valid:errors.length===0,errors,warnings};
}

export function makeInverseDynamicsResult(
  solver:string,
  input:InverseDynamicsInput,
  generalizedForces:Record<string,number>,
  warnings:string[]=[]
):InverseDynamicsResult{
  const dofOrder=input.model.joints.filter(joint=>joint.type!=="FIXED").map(joint=>joint.id);
  return {solver,generalizedForces:{...generalizedForces},dofOrder,warnings:[...warnings]};
}
