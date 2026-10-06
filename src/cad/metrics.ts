export interface CADBoundingBoxMm{
  x:number;
  y:number;
  z:number;
}

export interface CADGeometryMetrics{
  solidCount?:number;
  volumeMm3?:number;
  surfaceAreaMm2?:number;
  boundingBoxMm?:CADBoundingBoxMm;
  watertight?:boolean;
  minWallThicknessMm?:number;
  maxOverhangDeg?:number;
  triangleCount?:number;
}

export interface CADGeometrySnapshot{
  artifactId:string;
  backend:string;
  metrics:CADGeometryMetrics;
  sourceSha256?:string;
}

export type CADMetricName=
  "volumeMm3"|
  "surfaceAreaMm2"|
  "boundingBoxMm.x"|
  "boundingBoxMm.y"|
  "boundingBoxMm.z"|
  "solidCount"|
  "minWallThicknessMm"|
  "maxOverhangDeg"|
  "triangleCount"|
  "watertight";

export function readCADMetric(metrics:CADGeometryMetrics,name:CADMetricName):number|boolean|undefined{
  switch(name){
    case "volumeMm3": return metrics.volumeMm3;
    case "surfaceAreaMm2": return metrics.surfaceAreaMm2;
    case "boundingBoxMm.x": return metrics.boundingBoxMm?.x;
    case "boundingBoxMm.y": return metrics.boundingBoxMm?.y;
    case "boundingBoxMm.z": return metrics.boundingBoxMm?.z;
    case "solidCount": return metrics.solidCount;
    case "minWallThicknessMm": return metrics.minWallThicknessMm;
    case "maxOverhangDeg": return metrics.maxOverhangDeg;
    case "triangleCount": return metrics.triangleCount;
    case "watertight": return metrics.watertight;
  }
}
