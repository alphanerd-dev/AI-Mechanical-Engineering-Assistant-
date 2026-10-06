import {CADGeometryMetrics,CADMetricName,readCADMetric} from "./metrics.js";

export type CADDFMRule=
  {kind:"MIN_WALL_THICKNESS_MM";minimumMm:number}|
  {kind:"MAX_OVERHANG_DEG";maximumDeg:number}|
  {kind:"REQUIRE_WATERTIGHT";required:boolean}|
  {kind:"MAX_ENVELOPE_MM";axis:"x"|"y"|"z";maximumMm:number}|
  {kind:"MIN_SOLID_COUNT";minimum:number};

export interface CADDFMCheck{
  rule:string;
  pass:boolean;
  message:string;
  measured?:number|boolean;
  limit?:number|boolean;
}

export interface CADDFMResult{
  status:"PASS"|"FAIL"|"INCOMPLETE";
  checks:CADDFMCheck[];
  blockingReasons:string[];
  warnings:string[];
}

function nonNegativeFinite(value:number):boolean{
  return Number.isFinite(value)&&value>=0;
}

export function evaluateCADDFM(metrics:CADGeometryMetrics,rules:CADDFMRule[]):CADDFMResult{
  const checks:CADDFMCheck[]=[];
  const blockingReasons:string[]=[];
  const warnings:string[]=[];
  let incomplete=false;

  for(const rule of rules){
    if(rule.kind==="MIN_WALL_THICKNESS_MM"){
      if(!nonNegativeFinite(rule.minimumMm)){
        incomplete=true;
        blockingReasons.push("Minimum wall-thickness rule is invalid.");
        continue;
      }
      const value=metrics.minWallThicknessMm;
      if(value===undefined){
        incomplete=true;
        blockingReasons.push("Minimum wall thickness was not measured.");
        continue;
      }
      const pass=Number.isFinite(value)&&value>=rule.minimumMm;
      checks.push({rule:rule.kind,pass,message:pass?"Minimum wall thickness meets the explicit limit.":"Minimum wall thickness is below the explicit limit.",measured:value,limit:rule.minimumMm});
      if(!pass) blockingReasons.push("Minimum wall thickness is below the explicit limit.");
      continue;
    }

    if(rule.kind==="MAX_OVERHANG_DEG"){
      if(!nonNegativeFinite(rule.maximumDeg)){
        incomplete=true;
        blockingReasons.push("Maximum overhang rule is invalid.");
        continue;
      }
      const value=metrics.maxOverhangDeg;
      if(value===undefined){
        incomplete=true;
        blockingReasons.push("Maximum overhang angle was not measured.");
        continue;
      }
      const pass=Number.isFinite(value)&&value<=rule.maximumDeg;
      checks.push({rule:rule.kind,pass,message:pass?"Maximum overhang is within the explicit limit.":"Maximum overhang exceeds the explicit limit.",measured:value,limit:rule.maximumDeg});
      if(!pass) blockingReasons.push("Maximum overhang exceeds the explicit limit.");
      continue;
    }

    if(rule.kind==="REQUIRE_WATERTIGHT"){
      const value=metrics.watertight;
      if(value===undefined){
        incomplete=true;
        blockingReasons.push("Watertightness was not measured.");
        continue;
      }
      const pass=value===rule.required;
      checks.push({rule:rule.kind,pass,message:pass?"Watertightness matches the explicit requirement.":"Watertightness does not match the explicit requirement.",measured:value,limit:rule.required});
      if(!pass) blockingReasons.push("Watertightness does not match the explicit requirement.");
      continue;
    }

    if(rule.kind==="MAX_ENVELOPE_MM"){
      if(!nonNegativeFinite(rule.maximumMm)){
        incomplete=true;
        blockingReasons.push(`Maximum envelope rule for ${rule.axis} is invalid.`);
        continue;
      }
      const metricName:CADMetricName=`boundingBoxMm.${rule.axis}`;
      const value=readCADMetric(metrics,metricName);
      if(typeof value!=="number"){
        incomplete=true;
        blockingReasons.push(`Bounding-box measurement ${rule.axis} is missing.`);
        continue;
      }
      const pass=Number.isFinite(value)&&value<=rule.maximumMm;
      checks.push({rule:`${rule.kind}:${rule.axis}`,pass,message:pass?"Envelope is within the explicit limit.":"Envelope exceeds the explicit limit.",measured:value,limit:rule.maximumMm});
      if(!pass) blockingReasons.push(`Bounding-box envelope ${rule.axis} exceeds the explicit limit.`);
      continue;
    }

    if(rule.kind==="MIN_SOLID_COUNT"){
      if(!Number.isInteger(rule.minimum)||rule.minimum<1){
        incomplete=true;
        blockingReasons.push("Minimum solid-count rule is invalid.");
        continue;
      }
      const value=metrics.solidCount;
      if(value===undefined){
        incomplete=true;
        blockingReasons.push("Solid count was not measured.");
        continue;
      }
      const pass=Number.isInteger(value)&&value>=rule.minimum;
      checks.push({rule:rule.kind,pass,message:pass?"Solid count meets the explicit minimum.":"Solid count is below the explicit minimum.",measured:value,limit:rule.minimum});
      if(!pass) blockingReasons.push("Solid count is below the explicit minimum.");
    }
  }

  if(rules.length===0){
    incomplete=true;
    warnings.push("No DFM rules were supplied.");
  }

  return {
    status:incomplete?"INCOMPLETE":blockingReasons.length?"FAIL":"PASS",
    checks,
    blockingReasons,
    warnings
  };
}

export interface CADWallThicknessCheck{
  status:"PASS"|"FAIL"|"INCOMPLETE";
  measuredMm?:number;
  minimumMm:number;
  message:string;
}

export function checkCADWallThickness(metrics:CADGeometryMetrics,minimumMm:number):CADWallThicknessCheck{
  if(!nonNegativeFinite(minimumMm))
    return {status:"INCOMPLETE",minimumMm,message:"Minimum wall-thickness limit is invalid."};
  const measured=metrics.minWallThicknessMm;
  if(measured===undefined)
    return {status:"INCOMPLETE",minimumMm,message:"Minimum wall thickness was not measured."};
  const pass=Number.isFinite(measured)&&measured>=minimumMm;
  return {
    status:pass?"PASS":"FAIL",
    measuredMm:measured,
    minimumMm,
    message:pass?"Minimum wall thickness meets the explicit limit.":"Minimum wall thickness is below the explicit limit."
  };
}
