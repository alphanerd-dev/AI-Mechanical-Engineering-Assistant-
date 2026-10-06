import {CADGeometrySnapshot,CADMetricName,readCADMetric} from "./metrics.js";

export interface CADMetricTolerance{
  absolute?:number;
  relative?:number;
}

export interface CADRegressionCriterion{
  metric:CADMetricName;
  tolerance?:CADMetricTolerance;
}

export interface CADRegressionCheck{
  metric:CADMetricName;
  baseline:number|boolean;
  candidate:number|boolean;
  delta?:number;
  relativeDelta?:number;
  pass:boolean;
  message:string;
}

export interface CADRegressionResult{
  status:"PASS"|"FAIL"|"INCOMPLETE";
  baselineArtifactId:string;
  candidateArtifactId:string;
  checks:CADRegressionCheck[];
  blockingReasons:string[];
  warnings:string[];
}

function validTolerance(value:number|undefined):boolean{
  return value===undefined||(Number.isFinite(value)&&value>=0);
}

export function compareCADGeometry(
  baseline:CADGeometrySnapshot,
  candidate:CADGeometrySnapshot,
  criteria:CADRegressionCriterion[]
):CADRegressionResult{
  const checks:CADRegressionCheck[]=[];
  const blockingReasons:string[]=[];
  const warnings:string[]=[];
  let incomplete=false;

  if(!baseline.artifactId||!candidate.artifactId){
    return {
      status:"INCOMPLETE",
      baselineArtifactId:baseline.artifactId,
      candidateArtifactId:candidate.artifactId,
      checks:[],
      blockingReasons:["Both baseline and candidate artifact ids are required."],
      warnings:[]
    };
  }

  for(const criterion of criteria){
    const tolerance=criterion.tolerance??{};
    if(!validTolerance(tolerance.absolute)||!validTolerance(tolerance.relative)){
      incomplete=true;
      blockingReasons.push(`Tolerance for ${criterion.metric} is invalid.`);
      continue;
    }

    const baselineValue=readCADMetric(baseline.metrics,criterion.metric);
    const candidateValue=readCADMetric(candidate.metrics,criterion.metric);

    if(baselineValue===undefined||candidateValue===undefined){
      incomplete=true;
      blockingReasons.push(`Metric ${criterion.metric} is missing from the baseline or candidate measurement.`);
      continue;
    }

    if(typeof baselineValue!==typeof candidateValue){
      incomplete=true;
      blockingReasons.push(`Metric ${criterion.metric} has incompatible value types.`);
      continue;
    }

    if(typeof baselineValue==="boolean"&&typeof candidateValue==="boolean"){
      const pass=baselineValue===candidateValue;
      checks.push({
        metric:criterion.metric,
        baseline:baselineValue,
        candidate:candidateValue,
        pass,
        message:pass?"Boolean geometry state is unchanged.":"Boolean geometry state changed."
      });
      if(!pass) blockingReasons.push(`Metric ${criterion.metric} changed.`);
      continue;
    }

    const before=baselineValue as number;
    const after=candidateValue as number;
    if(!Number.isFinite(before)||!Number.isFinite(after)){
      incomplete=true;
      blockingReasons.push(`Metric ${criterion.metric} is not finite.`);
      continue;
    }

    const delta=after-before;
    const relativeDelta=before===0?(after===0?0:Infinity):Math.abs(delta/before);
    const absolutePass=tolerance.absolute===undefined||Math.abs(delta)<=tolerance.absolute;
    const relativePass=tolerance.relative===undefined||relativeDelta<=tolerance.relative;
    const pass=absolutePass&&relativePass;

    checks.push({
      metric:criterion.metric,
      baseline:before,
      candidate:after,
      delta,
      relativeDelta,
      pass,
      message:pass?"Metric is within the explicit regression tolerance.":"Metric exceeds the explicit regression tolerance."
    });
    if(!pass) blockingReasons.push(`Metric ${criterion.metric} exceeds its regression tolerance.`);
  }

  if(criteria.length===0){
    incomplete=true;
    warnings.push("No regression criteria were supplied.");
  }

  return {
    status:incomplete?"INCOMPLETE":blockingReasons.length?"FAIL":"PASS",
    baselineArtifactId:baseline.artifactId,
    candidateArtifactId:candidate.artifactId,
    checks,
    blockingReasons,
    warnings
  };
}
