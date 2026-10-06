import {ParsedToleranceCallout} from "./types.js";
function num(s:string){return Number(s);}
export function parseToleranceCallout(input:string,unit:string="mm"):ParsedToleranceCallout{
  const text=input.trim().replace(/\s+/g,"");
  const symmetric=text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))±((?:\d+(?:\.\d*)?|\.\d+))$/);
  if(symmetric){const n=num(symmetric[1]),t=num(symmetric[2]);if(!Number.isFinite(n)||!Number.isFinite(t)||t<0)return {status:"INVALID",unit,message:"Callout contains an invalid tolerance."};return {status:"PARSED",nominal:n,plus:t,minus:t,unit,standard:"GENERIC",message:"Symmetric tolerance callout parsed."};}
  const bilateral=text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([+-](?:\d+(?:\.\d*)?|\.\d+))\/([+-](?:\d+(?:\.\d*)?|\.\d+))$/);
  if(bilateral){const n=num(bilateral[1]),p=Math.abs(num(bilateral[2])),m=Math.abs(num(bilateral[3]));if(!Number.isFinite(n)||!Number.isFinite(p)||!Number.isFinite(m))return {status:"INVALID",unit,message:"Callout contains a non-finite number."};return {status:"PARSED",nominal:n,plus:p,minus:m,unit,standard:"GENERIC",message:"Bilateral tolerance callout parsed."};}
  const unilateral=text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\+0\/-(\d+(?:\.\d*)?|\.\d+)$/);
  if(unilateral){const n=num(unilateral[1]),m=num(unilateral[2]);if(!Number.isFinite(n)||!Number.isFinite(m))return {status:"INVALID",unit,message:"Callout contains a non-finite number."};return {status:"PARSED",nominal:n,plus:0,minus:m,unit,standard:"GENERIC",message:"Unilateral lower tolerance callout parsed."};}
  return {status:"INCOMPLETE",unit,message:"Unsupported callout syntax. Supply explicit nominal and deviations for non-generic fit designations."};
}
export function makeISO286FitCallout(nominal:number,unit:string,plus:number,minus:number,designation:string):ParsedToleranceCallout{
  if(!designation.trim())return {status:"INCOMPLETE",unit,message:"ISO 286 fit designation is required."};
  if(!Number.isFinite(nominal)||!Number.isFinite(plus)||!Number.isFinite(minus)||plus<0||minus<0)return {status:"INVALID",unit,message:"Explicit ISO 286 deviations must be finite and non-negative."};
  return {status:"PARSED",nominal,plus,minus,unit,standard:"ISO_286",designation,message:"ISO 286 designation recorded with explicitly supplied deviations; no fit-table values are invented."};
}
