import {MultibodyDynamicsResult} from "./types.js";

export interface DynamicsComparisonCriterion{
  name:string;
  reference:number;
  candidate:number;
  unit:string;
  absoluteTolerance?:number;
  relativeTolerance?:number;
}

export interface DynamicsComparisonCheck{
  name:string;
  pass:boolean;
  difference:number;
  allowedDifference:number;
  unit:string;
  message:string;
}

export interface DynamicsComparisonResult{
  status:"MATCH"|"MISMATCH"|"INCOMPLETE";
  checks:DynamicsComparisonCheck[];
  warnings:string[];
  message:string;
}

function validTolerance(value:number|undefined):boolean{
  return value===undefined || (Number.isFinite(value)&&value>=0);
}

function allowedDifference(criterion:DynamicsComparisonCriterion):number|undefined{
  if(!validTolerance(criterion.absoluteTolerance)||!validTolerance(criterion.relativeTolerance)) return undefined;
  const absolute=criterion.absoluteTolerance??0;
  const relative=(criterion.relativeTolerance??0)*Math.max(Math.abs(criterion.reference),Math.abs(criterion.candidate));
  if(criterion.absoluteTolerance===undefined && criterion.relativeTolerance===undefined) return undefined;
  return Math.max(absolute,relative);
}

export function compareMultibodyDynamicsResults(
  referenceResult:MultibodyDynamicsResult,
  candidateResult:MultibodyDynamicsResult,
  criteria:DynamicsComparisonCriterion[],
  requireConverged=true
):DynamicsComparisonResult{
  const warnings:string[]=[];
  const checks:DynamicsComparisonCheck[]=[];

  if(!referenceResult||!candidateResult||!Array.isArray(criteria)||criteria.length===0)
    return {status:"INCOMPLETE",checks,warnings,message:"Two dynamics results and at least one explicit comparison criterion are required."};

  if(requireConverged && (!referenceResult.converged||!candidateResult.converged))
    return {status:"INCOMPLETE",checks,warnings,message:"Cross-solver comparison requires both explicit results to report converged=true."};

  if(!Number.isFinite(referenceResult.durationS)||!Number.isFinite(candidateResult.durationS))
    return {status:"INCOMPLETE",checks,warnings,message:"Both dynamics results require finite duration values."};

  const seen=new Set<string>();
  for(const criterion of criteria){
    if(!criterion.name.trim()||seen.has(criterion.name))
      return {status:"INCOMPLETE",checks,warnings,message:"Comparison criterion names must be non-empty and unique."};
    seen.add(criterion.name);
    if(!criterion.unit.trim()||!Number.isFinite(criterion.reference)||!Number.isFinite(criterion.candidate))
      return {status:"INCOMPLETE",checks,warnings,message:"Each comparison criterion requires finite values and an explicit unit."};

    const allowed=allowedDifference(criterion);
    if(allowed===undefined)
      return {status:"INCOMPLETE",checks,warnings,message:"Each comparison criterion requires an explicit absolute or relative tolerance."};

    const difference=Math.abs(criterion.reference-criterion.candidate);
    const pass=difference<=allowed+1e-12;
    checks.push({
      name:criterion.name,
      pass,
      difference,
      allowedDifference:allowed,
      unit:criterion.unit,
      message:pass?"Dynamics values agree within the explicit tolerance.":"Dynamics values exceed the explicit tolerance."
    });
  }

  if(Math.abs(referenceResult.durationS-candidateResult.durationS)>1e-12){
    warnings.push("Solver result durations differ; comparison criteria must still be interpreted at their explicitly defined measurement points.");
  }
  if(referenceResult.steps!==candidateResult.steps){
    warnings.push("Solver step counts differ; this comparison does not claim trajectory equivalence.");
  }

  const pass=checks.every(check=>check.pass);
  return {
    status:pass?"MATCH":"MISMATCH",
    checks,
    warnings,
    message:pass?"Explicit cross-solver dynamics criteria match within tolerance.":"One or more explicit cross-solver dynamics criteria exceed tolerance."
  };
}
