import {InformationStatus} from "../core/types.js";
export type ValidationLevel="PASS"|"FAIL"|"INCOMPLETE";
export interface ComputationValidation{level:ValidationLevel;checks:string[];warnings:string[];status:InformationStatus;}
export function validateComputationOutput(output:Record<string,unknown>):ComputationValidation{
 const checks:string[]=[];const warnings:string[]=[];
 if(output===null||typeof output!=="object")return {level:"FAIL",checks:[],warnings:["Output must be an object."],status:"ASSUMED"};
 checks.push("output-schema");
 const numericValues=Object.values(output).filter(v=>typeof v==="number") as number[];
 if(numericValues.some(v=>!Number.isFinite(v)))return {level:"FAIL",checks,warnings:["Non-finite numeric output."],status:"ASSUMED"};
 if(output.status==="CALCULATED")checks.push("calculated-status");else warnings.push("Provider did not mark output as CALCULATED.");
 return {level:warnings.length?"INCOMPLETE":"PASS",checks,warnings,status:warnings.length?"CALCULATED":"VERIFIED"};
}
