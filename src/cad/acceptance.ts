import {GeometryValidation} from './artifacts.js';

export interface CADAcceptance {accepted:boolean;status:'ACCEPTED'|'REJECTED'|'INCOMPLETE';blockingReasons:string[];warnings:string[];}

export function evaluateCADAcceptance(validation:GeometryValidation|undefined):CADAcceptance{
  if(!validation) return {accepted:false,status:'INCOMPLETE',blockingReasons:[],warnings:['Independent geometry validation evidence is missing.']};
  if(!validation.valid) return {accepted:false,status:'REJECTED',blockingReasons:['Geometry validation failed.'],warnings:validation.warnings};
  if(validation.solidCount!==undefined&&validation.solidCount<1) return {accepted:false,status:'REJECTED',blockingReasons:['No valid solid was detected.'],warnings:validation.warnings};
  return {accepted:true,status:'ACCEPTED',blockingReasons:[],warnings:validation.warnings};
}