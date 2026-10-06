export type DynamicsJointType="FIXED"|"REVOLUTE"|"PRISMATIC";

export interface DynamicsBody {
  id:string;
  name:string;
  massKg:number;
  centerOfMassM?:{x:number;y:number;z:number};
  inertiaKgM2?:{ixx:number;iyy:number;izz:number;ixy?:number;ixz?:number;iyz?:number};
}

export interface DynamicsJoint {
  id:string;
  name:string;
  type:DynamicsJointType;
  parentBodyId:string|null;
  childBodyId:string;
  axis?:{x:number;y:number;z:number};
}

export interface MultibodyDynamicsModel {
  id:string;
  name:string;
  bodies:DynamicsBody[];
  joints:DynamicsJoint[];
}

export interface MultibodyDynamicsInput {
  model:MultibodyDynamicsModel;
  timeStepS:number;
  durationS:number;
  initialConditions?:Record<string,number>;
}

export interface DynamicsState {
  timeS:number;
  positions:Record<string,number>;
  velocities:Record<string,number>;
  accelerations?:Record<string,number>;
}

export interface MultibodyDynamicsResult {
  converged:boolean;
  steps:number;
  durationS:number;
  states?:DynamicsState[];
  warnings:string[];
}

export interface DynamicsModelValidation {
  valid:boolean;
  errors:string[];
  warnings:string[];
}
