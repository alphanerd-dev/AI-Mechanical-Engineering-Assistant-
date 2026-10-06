export type RoboticsAssetFormat="URDF"|"MJCF"|"USD";
export type RoboticsTopology="TREE"|"GRAPH";
export type RoboticsJointType="FIXED"|"REVOLUTE"|"PRISMATIC"|"CONTINUOUS";

export interface RoboticsLink{
  id:string;
  name:string;
  massKg?:number;
}

export interface RoboticsJoint{
  id:string;
  name:string;
  type:RoboticsJointType;
  parentLinkId:string;
  childLinkId:string;
  axis?:{x:number;y:number;z:number};
}

export interface RoboticsAsset{
  id:string;
  name:string;
  format:RoboticsAssetFormat;
  topology:RoboticsTopology;
  rootLinkId?:string;
  links:RoboticsLink[];
  joints:RoboticsJoint[];
  sourceCadArtifactId?:string;
  uri?:string;
  content?:string;
  validationStatus:"UNVALIDATED"|"PASS"|"FAIL";
}

export interface CADToRoboticsRequest{
  sourceArtifactId:string;
  targetFormat:RoboticsAssetFormat;
  topology?:RoboticsTopology;
  options?:Record<string,unknown>;
}

export interface RoboticsAssetValidation{
  valid:boolean;
  errors:string[];
  warnings:string[];
}
