import {EngineeringConstraint,ConstraintEvaluation} from "./types.js";

export function evaluateConstraint(constraint:EngineeringConstraint, values:Record<string,number>):ConstraintEvaluation{
  for(const variable of constraint.variables){
    if(!Number.isFinite(values[variable])) return {constraintId:constraint.id,satisfied:false,message:"Missing finite value for "+variable};
  }
  if(constraint.kind==="BOUND"){
    const value=values[constraint.variables[0]];
    if(constraint.lower!==undefined && value<constraint.lower) return {constraintId:constraint.id,satisfied:false,residual:value-constraint.lower,message:"Lower bound violated."};
    if(constraint.upper!==undefined && value>constraint.upper) return {constraintId:constraint.id,satisfied:false,residual:value-constraint.upper,message:"Upper bound violated."};
    return {constraintId:constraint.id,satisfied:true,residual:0,message:"Bounds satisfied."};
  }
  return {constraintId:constraint.id,satisfied:false,message:"Constraint expression requires a solver provider: "+constraint.expression};
}
