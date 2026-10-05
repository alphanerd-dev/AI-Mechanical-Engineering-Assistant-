export interface ValidationResult {
  valid:boolean;
  checks:{name:string;passed:boolean;message:string}[];
}
export function validatePositiveEngineeringResult(values:Record<string,number>):ValidationResult {
  const checks=Object.entries(values).map(([name,value])=>({
    name,passed:Number.isFinite(value)&&value>0,
    message:Number.isFinite(value)&&value>0?"Valid positive finite result":"Expected a positive finite result"
  }));
  return {valid:checks.every(c=>c.passed),checks};
}
