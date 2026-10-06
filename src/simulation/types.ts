export interface FEAModelInput {
  artifactId:string;
  material:{name:string;yieldStrengthMpa:number};
  loads:Array<{name:string;type:string;value:number;unit:string;location?:string}>;
  constraints:Array<{name:string;type:string;location:string}>;
  mesh:{elementSizeMm:number;method?:string};
}
export interface FEAResult {
  converged:boolean;
  maxStressMpa:number;
  maxDisplacementMm:number;
  reactionForces?:Record<string,number>;
  meshElementCount?:number;
  warnings:string[];
}
export interface SimulationValidation {
  pass:boolean;
  checks:Array<{name:string;pass:boolean;message:string}>;
}
