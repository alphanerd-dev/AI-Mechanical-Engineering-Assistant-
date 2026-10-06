export type ConstraintKind="BOUND"|"EQUALITY"|"INEQUALITY"|"GEOMETRIC"|"PHYSICAL"|"INTERFACE";
export interface EngineeringConstraint {
  id:string; name:string; kind:ConstraintKind; expression:string;
  variables:string[]; units?:Record<string,string>; sourceRequirementIds?:string[];
  lower?:number; upper?:number; status:"OPEN"|"SATISFIED"|"VIOLATED"|"UNKNOWN";
}
export interface ConstraintEvaluation { constraintId:string; satisfied:boolean; residual?:number; message:string; }
