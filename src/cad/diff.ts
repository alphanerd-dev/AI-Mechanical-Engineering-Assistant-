import {CADGeometrySnapshot,CADMetricName,readCADMetric} from "./metrics.js";

export interface CADGeometryDiff{
  metric:CADMetricName;
  baseline?:number|boolean;
  candidate?:number|boolean;
  delta?:number;
  changed:boolean;
}

export interface CADDiffResult{
  status:"CHANGED"|"UNCHANGED"|"INCOMPLETE";
  sourceChanged?:boolean;
  geometryChanged:boolean;
  diffs:CADGeometryDiff[];
  blockingReasons:string[];
}

export function diffCADGeometry(
  baseline:CADGeometrySnapshot,
  candidate:CADGeometrySnapshot,
  metrics:CADMetricName[]
):CADDiffResult{
  const diffs:CADGeometryDiff[]=[];
  const blockingReasons:string[]=[];

  for(const metric of metrics){
    const before=readCADMetric(baseline.metrics,metric);
    const after=readCADMetric(candidate.metrics,metric);

    if(before===undefined||after===undefined){
      blockingReasons.push(`Metric ${metric} is missing from the baseline or candidate.`);
      continue;
    }

    if(typeof before!==typeof after){
      blockingReasons.push(`Metric ${metric} has incompatible value types.`);
      continue;
    }

    const delta=typeof before==="number"&&typeof after==="number"?after-before:undefined;
    diffs.push({
      metric,
      baseline:before,
      candidate:after,
      delta,
      changed:before!==after
    });
  }

  const geometryChanged=diffs.some(diff=>diff.changed);
  const sourceChanged=baseline.sourceSha256!==undefined&&candidate.sourceSha256!==undefined
    ?baseline.sourceSha256!==candidate.sourceSha256
    :undefined;

  if(blockingReasons.length)
    return {status:"INCOMPLETE",sourceChanged,geometryChanged,diffs,blockingReasons};

  return {
    status:geometryChanged||sourceChanged?"CHANGED":"UNCHANGED",
    sourceChanged,
    geometryChanged,
    diffs,
    blockingReasons:[]
  };
}
