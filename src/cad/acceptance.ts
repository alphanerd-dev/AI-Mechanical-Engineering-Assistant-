import {GeometryValidation} from "./artifacts.js";

export interface CADAcceptance {
  accepted:boolean;
  status:"ACCEPTED"|"REJECTED"|"INCOMPLETE";
  blockingReasons:string[];
  warnings:string[];
}

export function evaluateCADAcceptance(validation:GeometryValidation|undefined):CADAcceptance {
  if (!validation) {
    return {accepted:false,status:"INCOMPLETE",blockingReasons:[],warnings:["Independent geometry validation evidence is missing."]};
  }
  if (typeof validation.valid !== "boolean") {
    return {accepted:false,status:"INCOMPLETE",blockingReasons:[],warnings:["Geometry validator did not return an explicit valid/invalid verdict."]};
  }
  if (typeof validation.checkedBy !== "string" || !validation.checkedBy.trim()) {
    return {accepted:false,status:"INCOMPLETE",blockingReasons:[],warnings:["Geometry validation does not identify the validator."]};
  }
  if (!Array.isArray(validation.warnings)) {
    return {accepted:false,status:"INCOMPLETE",blockingReasons:[],warnings:["Geometry validation warnings are missing or malformed."]};
  }
  if (validation.solidCount === undefined) {
    return {accepted:false,status:"INCOMPLETE",blockingReasons:[],warnings:[...validation.warnings,"Geometry validator did not report a solid count."]};
  }
  if (!Number.isInteger(validation.solidCount) || validation.solidCount < 0) {
    return {accepted:false,status:"REJECTED",blockingReasons:["Geometry validator returned an invalid solid count."],warnings:validation.warnings};
  }
  if (!validation.valid) {
    return {accepted:false,status:"REJECTED",blockingReasons:["Geometry validation failed."],warnings:validation.warnings};
  }
  if (validation.solidCount < 1) {
    return {accepted:false,status:"REJECTED",blockingReasons:["No valid solid was detected."],warnings:validation.warnings};
  }
  return {accepted:true,status:"ACCEPTED",blockingReasons:[],warnings:validation.warnings};
}
