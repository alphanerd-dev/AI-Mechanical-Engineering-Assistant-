import {ManufacturingInspectionCriterion,ManufacturingInspectionResult,ManufacturingInspectionAcceptance,ManufacturingPlanValidation,ManufacturingProcessPlan,ManufacturingProcess} from "./types.js";

const MANUFACTURING_PROCESSES=new Set<ManufacturingProcess>(["MACHINING","ADDITIVE","SHEET_METAL","WELDING","CASTING","FORMING","ASSEMBLY"]);

export function validateManufacturingProcessPlan(plan:ManufacturingProcessPlan):ManufacturingPlanValidation{
  const errors:string[]=[];
  const warnings:string[]=[];

  if(!plan.id.trim()) errors.push("Process plan id is required.");
  if(!plan.projectId.trim()) errors.push("Process plan projectId is required.");
  if(!plan.name.trim()) errors.push("Process plan name is required.");
  if(plan.partArtifactIds.length===0) errors.push("At least one part artifact must be linked to the process plan.");
  if(plan.requirementIds.length===0) warnings.push("No requirements are linked to the process plan.");
  if(plan.status==="BLOCKED") errors.push("Process plan is marked BLOCKED.");

  if(plan.operations.length===0){
    return {valid:false,status:errors.length>0?"FAIL":"INCOMPLETE",errors,warnings:[...warnings,"At least one manufacturing operation is required."]};
  }

  const ids=new Set<string>();
  const sequences=new Set<number>();

  for(const operation of plan.operations){
    if(ids.has(operation.id)) errors.push("Duplicate manufacturing operation id: "+operation.id+".");
    ids.add(operation.id);
    if(!operation.id.trim()) errors.push("Manufacturing operation id is required.");
    if(!operation.name.trim()) errors.push("Operation "+(operation.id||"(unnamed)")+" requires a name.");
    if(!MANUFACTURING_PROCESSES.has(operation.process)) errors.push("Operation "+(operation.id||"(unnamed)")+" has an unsupported manufacturing process.");
    if(!Number.isInteger(operation.sequence)||operation.sequence<1)
      errors.push("Operation "+(operation.id||"(unnamed)")+" requires a positive integer sequence.");
    else sequences.add(operation.sequence);
    if(operation.acceptanceCriteria.length===0)
      errors.push("Operation "+(operation.id||"(unnamed)")+" requires at least one acceptance criterion.");
  }

  for(let i=1;i<=plan.operations.length;i++){
    if(!sequences.has(i)) errors.push("Manufacturing operation sequence is missing step "+i+".");
  }

  for(const operation of plan.operations){
    for(const predecessorId of operation.predecessorIds??[]){
      if(!ids.has(predecessorId)) errors.push("Operation "+operation.id+" references missing predecessor "+predecessorId+".");
      if(predecessorId===operation.id) errors.push("Operation "+operation.id+" cannot depend on itself.");
    }
  }

  const status=errors.length>0?"FAIL":"PASS";
  return {valid:status==="PASS",status,errors,warnings};
}

function finiteOptional(value:number|undefined):boolean{
  return value===undefined||Number.isFinite(value);
}

function resolveLimits(criterion:ManufacturingInspectionCriterion):{lower?:number;upper?:number;error?:string}{
  const hasNominal=criterion.nominal!==undefined;
  const hasTolerance=criterion.tolerance!==undefined;
  const hasLower=criterion.lowerLimit!==undefined;
  const hasUpper=criterion.upperLimit!==undefined;

  if(!finiteOptional(criterion.nominal)||!finiteOptional(criterion.tolerance)||!finiteOptional(criterion.lowerLimit)||!finiteOptional(criterion.upperLimit))
    return {error:"Inspection limits must be finite numbers."};
  if(criterion.tolerance!==undefined&&criterion.tolerance<0)
    return {error:"Tolerance cannot be negative."};
  if(hasNominal!==hasTolerance)
    return {error:"Nominal and tolerance must be supplied together."};
  if(hasNominal&&hasTolerance&&(hasLower||hasUpper))
    return {error:"Do not mix nominal/tolerance limits with explicit lower/upper limits."};

  if(hasNominal&&hasTolerance){
    const lower=criterion.nominal!-criterion.tolerance!;
    const upper=criterion.nominal!+criterion.tolerance!;
    return {lower,upper};
  }

  if(hasLower||hasUpper){
    if(criterion.lowerLimit!==undefined&&criterion.upperLimit!==undefined&&criterion.lowerLimit>criterion.upperLimit)
      return {error:"Lower inspection limit cannot exceed upper inspection limit."};
    return {lower:criterion.lowerLimit,upper:criterion.upperLimit};
  }

  return {error:"Inspection criterion has no acceptance limits."};
}

export function evaluateManufacturingInspection(
  criterion:ManufacturingInspectionCriterion,
  result:ManufacturingInspectionResult
):ManufacturingInspectionAcceptance{
  const warnings:string[]=[];

  if(!criterion.id.trim()) return {accepted:false,status:"INCOMPLETE",reason:"Inspection criterion id is required.",warnings};
  if(!criterion.characteristic.trim()) return {accepted:false,status:"INCOMPLETE",reason:"Inspection characteristic is required.",warnings};
  if(!criterion.method.trim()) return {accepted:false,status:"INCOMPLETE",reason:"Inspection method is required.",warnings};
  if(!criterion.unit.trim()) return {accepted:false,status:"INCOMPLETE",reason:"Inspection criterion unit is required.",warnings};
  if(result.criterionId!==criterion.id) return {accepted:false,status:"INCOMPLETE",reason:"Inspection result does not match the supplied criterion.",warnings};
  if(result.measuredValue===undefined||!Number.isFinite(result.measuredValue))
    return {accepted:false,status:"INCOMPLETE",reason:"A finite measured value is required.",warnings};
  if(result.unit!==criterion.unit)
    return {accepted:false,status:"INCOMPLETE",reason:"Measured unit must exactly match the criterion unit; conversion is not performed by this capability.",warnings};

  const limits=resolveLimits(criterion);
  if(limits.error) return {accepted:false,status:"INCOMPLETE",reason:limits.error,warnings};

  const measured=result.measuredValue;
  if(limits.lower!==undefined&&measured<limits.lower)
    return {accepted:false,status:"REJECTED",lowerLimit:limits.lower,upperLimit:limits.upper,reason:"Measured value is below the lower acceptance limit.",warnings};
  if(limits.upper!==undefined&&measured>limits.upper)
    return {accepted:false,status:"REJECTED",lowerLimit:limits.lower,upperLimit:limits.upper,reason:"Measured value is above the upper acceptance limit.",warnings};

  if(limits.lower===undefined||limits.upper===undefined) warnings.push("Inspection criterion uses a one-sided acceptance limit.");
  return {accepted:true,status:"ACCEPTED",lowerLimit:limits.lower,upperLimit:limits.upper,reason:"Measured value satisfies the configured acceptance limits.",warnings};
}
