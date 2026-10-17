import {InformationStatus} from "../core/types.js";

export type ValidationLevel="PASS"|"FAIL"|"INCOMPLETE";
export type ComputationInformationStatus=Extract<InformationStatus,"ASSUMED"|"CALCULATED">;

export interface ComputationValidation {
  level:ValidationLevel;
  checks:string[];
  warnings:string[];
  /**
   * Information status only. This generic check cannot promote an output to
   * VALIDATED or VERIFIED because it has no capability-specific validation
   * result or evidence receipt.
   */
  status:ComputationInformationStatus;
}

function isRecord(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==="object"&&!Array.isArray(value);
}

function containsNonFiniteNumber(value:unknown,ancestors=new WeakSet<object>()):boolean{
  if(typeof value==="number")return !Number.isFinite(value);
  if(value===null||typeof value!=="object")return false;

  // Cyclic objects are not valid JSON computation outputs and cannot be
  // safely fingerprinted with the JSON-based execution provenance contract.
  if(ancestors.has(value))return true;
  ancestors.add(value);
  const values=Array.isArray(value)?value:Object.values(value as Record<string,unknown>);
  const invalid=values.some(item=>containsNonFiniteNumber(item,ancestors));
  ancestors.delete(value);
  return invalid;
}

/**
 * Performs generic output-shape and numeric-sanity checks only.
 *
 * PASS means the output is structurally usable for further capability-specific
 * validation; it does not establish formula correctness, dimensional
 * consistency, engineering acceptability, or physical safety.
 */
export function validateComputationOutput(output:unknown):ComputationValidation{
  const checks:string[]=[];
  const warnings:string[]=[];

  if(!isRecord(output)){
    return {
      level:"FAIL",
      checks,
      warnings:["Output must be a non-array object."],
      status:"ASSUMED"
    };
  }

  checks.push("output-object");

  if(containsNonFiniteNumber(output)){
    return {
      level:"FAIL",
      checks,
      warnings:["Output contains a non-finite number or cyclic object."],
      status:"ASSUMED"
    };
  }
  checks.push("finite-numeric-values");

  if(output.status==="FAILED"){
    return {
      level:"FAIL",
      checks,
      warnings:["Provider reported calculation failure."],
      status:"ASSUMED"
    };
  }

  if(output.status!=="CALCULATED"){
    return {
      level:"INCOMPLETE",
      checks,
      warnings:["Output must declare CALCULATED status; generic checks cannot accept VALIDATED or VERIFIED claims without capability-specific evidence."],
      status:"ASSUMED"
    };
  }

  checks.push("calculated-status");
  return {level:"PASS",checks,warnings,status:"CALCULATED"};
}
