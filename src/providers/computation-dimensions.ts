import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {ComputationResult} from "../computation/types.js";
type Dimension={length:number;mass:number;time:number;current:number;temperature:number;amount:number;luminosity:number};
const Z:Dimension={length:0,mass:0,time:0,current:0,temperature:0,amount:0,luminosity:0};
const U:Record<string,Dimension>={
 "1":Z,mm:{...Z,length:1},cm:{...Z,length:1},m:{...Z,length:1},kg:{...Z,mass:1},g:{...Z,mass:1},s:{...Z,time:1},min:{...Z,time:1},
 N:{...Z,length:1,mass:1,time:-2},kN:{...Z,length:1,mass:1,time:-2},Pa:{...Z,length:-1,mass:1,time:-2},kPa:{...Z,length:-1,mass:1,time:-2},MPa:{...Z,length:-1,mass:1,time:-2},
 W:{...Z,length:2,mass:1,time:-3},kW:{...Z,length:2,mass:1,time:-3},Hz:{...Z,time:-1},rpm:{...Z,time:-1},rad:Z
};
const same=(a:Dimension,b:Dimension)=>Object.keys(a).every(k=>a[k as keyof Dimension]===b[k as keyof Dimension]);
export class DimensionalComputationProvider implements CapabilityProvider{
 id="computation.dimensions"; capabilities=["UNITS.CHECK_DIMENSIONS"];
 async execute(request:CapabilityRequest):Promise<CapabilityResult>{try{
  const qs=request.input.quantities as Array<{value:number;unit:string}>;
  if(!Array.isArray(qs)||qs.length===0)throw new Error("quantities must be a non-empty array");
  const ds=qs.map(q=>{if(!U[q.unit])throw new Error(`Unsupported unit: ${q.unit}`);return U[q.unit];});
  const compatible=ds.every(d=>same(d,ds[0]));
  const output:ComputationResult={operation:request.capability,success:true,outputs:[{value:compatible?1:0,unit:"boolean",status:"CALCULATED"}],warnings:compatible?[]:["Quantities do not have compatible dimensions."],evidence:{assumptions:[],inputs:qs.map((q,i)=>({name:`quantity_${i+1}`,value:q.value,unit:q.unit,status:"KNOWN"})),provider:this.id}};
  return {capability:request.capability,provider:this.id,success:true,output:{...output,compatible}};
 }catch(error){return {capability:request.capability,provider:this.id,success:false,error:String(error)};}}
}