import {CADDFMRule,CADDFMResult,evaluateCADDFM} from "../cad/dfm.js";
import {CADGeometryMetrics} from "../cad/metrics.js";
import {ManufacturingProcess} from "./types.js";

export interface ManufacturingDFMRequest{
  metrics:CADGeometryMetrics;
  rules:CADDFMRule[];
  process?:ManufacturingProcess;
}

export interface ManufacturingDFMResult extends CADDFMResult{
  process?:ManufacturingProcess;
}

export function evaluateManufacturingDFM(request:ManufacturingDFMRequest):ManufacturingDFMResult{
  const result=evaluateCADDFM(request.metrics,request.rules);
  return {...result,process:request.process};
}
