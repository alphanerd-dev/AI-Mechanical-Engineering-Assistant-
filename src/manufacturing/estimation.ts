export type ManufacturingEstimateStatus="ESTIMATED"|"INCOMPLETE"|"INVALID";

export interface ManufacturingMaterialEstimate{
  quantity:number;
  unit:string;
  unitCost:number;
  scrapFraction:number;
}

export interface ManufacturingOperationEstimate{
  id:string;
  quantity:number;
  setupMinutes:number;
  cycleMinutesPerUnit:number;
  machineRatePerHour:number;
  laborRatePerHour:number;
}

export interface ManufacturingEstimateRequest{
  currency:string;
  material:ManufacturingMaterialEstimate;
  operations:ManufacturingOperationEstimate[];
}

export interface ManufacturingOperationCost{
  id:string;
  timeMinutes:number;
  machineCost:number;
  laborCost:number;
  totalCost:number;
}

export interface ManufacturingEstimateResult{
  status:ManufacturingEstimateStatus;
  currency:string;
  materialQuantity?:number;
  materialUnit?:string;
  materialCost?:number;
  setupTimeMinutes?:number;
  cycleTimeMinutes?:number;
  totalTimeMinutes?:number;
  machineCost?:number;
  laborCost?:number;
  totalCost?:number;
  operations?:ManufacturingOperationCost[];
  message:string;
}

function validFinite(value:number){return Number.isFinite(value);}
function validateRate(value:number,name:string){return validFinite(value)&&value>=0?undefined:name+" must be a finite non-negative number.";}

export function estimateManufacturingEconomics(request:ManufacturingEstimateRequest):ManufacturingEstimateResult{
  if(!request.currency.trim())return {status:"INCOMPLETE",currency:request.currency,message:"Currency label is required."};
  if(!validFinite(request.material.quantity)||request.material.quantity<=0)return {status:"INCOMPLETE",currency:request.currency,message:"Material quantity must be positive and finite."};
  if(!request.material.unit.trim())return {status:"INCOMPLETE",currency:request.currency,message:"Material unit is required."};
  if(!validFinite(request.material.unitCost)||request.material.unitCost<0)return {status:"INCOMPLETE",currency:request.currency,message:"Material unit cost must be finite and non-negative."};
  if(!validFinite(request.material.scrapFraction)||request.material.scrapFraction<0||request.material.scrapFraction>=1)
    return {status:"INCOMPLETE",currency:request.currency,message:"Scrap fraction must be in the range [0,1)."};
  if(!Array.isArray(request.operations)||request.operations.length===0)
    return {status:"INCOMPLETE",currency:request.currency,message:"At least one manufacturing operation is required."};

  const ids=new Set<string>();
  const operations:ManufacturingOperationCost[]=[];
  let setupTimeMinutes=0;
  let cycleTimeMinutes=0;
  let machineCost=0;
  let laborCost=0;

  for(const operation of request.operations){
    if(!operation.id.trim())return {status:"INCOMPLETE",currency:request.currency,message:"Each manufacturing operation requires an id."};
    if(ids.has(operation.id))return {status:"INVALID",currency:request.currency,message:"Duplicate manufacturing operation id: "+operation.id+"."};
    ids.add(operation.id);
    if(!Number.isFinite(operation.quantity)||operation.quantity<=0)return {status:"INCOMPLETE",currency:request.currency,message:"Operation "+operation.id+" quantity must be positive and finite."};
    if(!Number.isFinite(operation.setupMinutes)||operation.setupMinutes<0)return {status:"INCOMPLETE",currency:request.currency,message:"Operation "+operation.id+" setup time must be finite and non-negative."};
    if(!Number.isFinite(operation.cycleMinutesPerUnit)||operation.cycleMinutesPerUnit<0)return {status:"INCOMPLETE",currency:request.currency,message:"Operation "+operation.id+" cycle time must be finite and non-negative."};
    const machineRateError=validateRate(operation.machineRatePerHour,"Operation "+operation.id+" machine rate");
    if(machineRateError)return {status:"INCOMPLETE",currency:request.currency,message:machineRateError};
    const laborRateError=validateRate(operation.laborRatePerHour,"Operation "+operation.id+" labor rate");
    if(laborRateError)return {status:"INCOMPLETE",currency:request.currency,message:laborRateError};

    const cycle=operation.quantity*operation.cycleMinutesPerUnit;
    const time=operation.setupMinutes+cycle;
    const machine=machineRateError?0:time*operation.machineRatePerHour/60;
    const labor=laborRateError?0:time*operation.laborRatePerHour/60;
    setupTimeMinutes+=operation.setupMinutes;
    cycleTimeMinutes+=cycle;
    machineCost+=machine;
    laborCost+=labor;
    operations.push({id:operation.id,timeMinutes:time,machineCost:machine,laborCost:labor,totalCost:machine+labor});
  }

  const materialQuantity=request.material.quantity*(1+request.material.scrapFraction);
  const materialCost=materialQuantity*request.material.unitCost;
  const totalTimeMinutes=setupTimeMinutes+cycleTimeMinutes;
  const totalCost=materialCost+machineCost+laborCost;

  return {
    status:"ESTIMATED",
    currency:request.currency,
    materialQuantity,
    materialUnit:request.material.unit,
    materialCost,
    setupTimeMinutes,
    cycleTimeMinutes,
    totalTimeMinutes,
    machineCost,
    laborCost,
    totalCost,
    operations,
    message:"Manufacturing economics estimated only from the explicit material, time, and rate inputs supplied."
  };
}
