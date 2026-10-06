import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
export class CrossValidationProvider implements CapabilityProvider{
 id="computation.cross-check"; capabilities=["MATH.CROSS_VALIDATE"];
 async execute(request:CapabilityRequest):Promise<CapabilityResult>{
  const calculations=request.input.calculations;
  if(!Array.isArray(calculations)||calculations.length<2)return {capability:request.capability,provider:this.id,success:false,error:"At least two calculations are required"};
  const tolerance=typeof request.input.relativeTolerance==="number"?request.input.relativeTolerance:1e-6;
  const values=calculations.map((x:any)=>Number(x.value)).filter(Number.isFinite);
  if(values.length!==calculations.length)return {capability:request.capability,provider:this.id,success:false,error:"All calculation values must be finite numbers"};
  const reference=values[0];
  const comparisons=values.map(v=>({value:v,relativeError:reference===0?Math.abs(v-reference):Math.abs((v-reference)/reference),agrees:reference===0?Math.abs(v)<=tolerance:Math.abs((v-reference)/reference)<=tolerance}));
  const agreement=comparisons.every(x=>x.agrees);
  return {capability:request.capability,provider:this.id,success:true,output:{agreement,confidence:agreement?"HIGH":"LOW",comparisons,tolerance},};
 }
}
