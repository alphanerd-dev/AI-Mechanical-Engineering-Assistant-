export interface SimulationComparisonMetric{
  name:string;
  reference:number;
  candidate:number;
  absoluteTolerance?:number;
  relativeTolerance?:number;
  unit?:string;
}

export type SimulationComparisonStatus="MATCH"|"MISMATCH"|"INCOMPLETE";

export interface SimulationComparisonResult{
  status:SimulationComparisonStatus;
  metrics:SimulationComparisonMetricResult[];
  reason:string;
}

export interface SimulationComparisonMetricResult{
  name:string;
  reference:number;
  candidate:number;
  absoluteDifference:number;
  relativeDifference:number;
  pass:boolean;
  unit?:string;
}

export function compareSimulationResults(metrics:SimulationComparisonMetric[]):SimulationComparisonResult{
  if(metrics.length===0) return {status:"INCOMPLETE",metrics:[],reason:"At least one simulation metric is required."};
  const results:SimulationComparisonMetricResult[]=[];
  for(const metric of metrics){
    if(!metric.name.trim() || !Number.isFinite(metric.reference) || !Number.isFinite(metric.candidate))
      return {status:"INCOMPLETE",metrics:results,reason:"Simulation comparison requires named finite metrics."};
    if(metric.absoluteTolerance===undefined && metric.relativeTolerance===undefined)
      return {status:"INCOMPLETE",metrics:results,reason:`Metric ${metric.name} requires an absolute or relative tolerance.`};
    if(metric.absoluteTolerance!==undefined && (!Number.isFinite(metric.absoluteTolerance)||metric.absoluteTolerance<0))
      return {status:"INCOMPLETE",metrics:results,reason:`Metric ${metric.name} has an invalid absolute tolerance.`};
    if(metric.relativeTolerance!==undefined && (!Number.isFinite(metric.relativeTolerance)||metric.relativeTolerance<0))
      return {status:"INCOMPLETE",metrics:results,reason:`Metric ${metric.name} has an invalid relative tolerance.`};
    const absoluteDifference=Math.abs(metric.candidate-metric.reference);
    const relativeDifference=metric.reference===0
      ? (absoluteDifference===0?0:Number.POSITIVE_INFINITY)
      : absoluteDifference/Math.abs(metric.reference);
    const pass=(metric.absoluteTolerance===undefined || absoluteDifference<=metric.absoluteTolerance) &&
      (metric.relativeTolerance===undefined || relativeDifference<=metric.relativeTolerance);
    results.push({name:metric.name,reference:metric.reference,candidate:metric.candidate,absoluteDifference,relativeDifference,pass,unit:metric.unit});
  }
  const pass=results.every(result=>result.pass);
  return {
    status:pass?"MATCH":"MISMATCH",
    metrics:results,
    reason:pass?"All simulation metrics satisfy the explicit tolerances.":"One or more simulation metrics exceed the explicit tolerances."
  };
}
