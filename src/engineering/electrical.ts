export function calculateDcPower(voltageV:number,currentA:number):{powerW:number}{
  if(!Number.isFinite(voltageV)||!Number.isFinite(currentA)) throw new Error("Voltage and current must be finite.");
  return {powerW:voltageV*currentA};
}

export function calculateDcResistance(voltageV:number,currentA:number):{resistanceOhm:number}{
  if(!Number.isFinite(voltageV)||!Number.isFinite(currentA)) throw new Error("Voltage and current must be finite.");
  if(currentA===0) throw new Error("Current must be non-zero for resistance calculation.");
  return {resistanceOhm:voltageV/currentA};
}
