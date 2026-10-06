import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {ComputationResult} from "../computation/types.js";
function solveLinear(eq:string,v:string){
 const s=eq.replace(/\s+/g,"").split("="); if(s.length!==2)throw new Error("Only one equality is supported");
 const m=s[0].match(new RegExp("^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)?)\\*?"+v+"([+-]\\d+(?:\\.\\d+)?)?$"));
 const r=s[1].match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/);
 if(!m||!r)throw new Error("Only simple linear equations such as 2*x+3=9 are supported");
 const a=m[1]===""||m[1]==="+"?1:m[1]==="-"?-1:Number(m[1]); const b=m[2]?Number(m[2]):0; return (Number(r[0])-b)/a;
}
export class SymbolicComputationProvider implements CapabilityProvider{
 id="computation.sympy"; capabilities=["MATH.SYMBOLIC_SOLVE"];
 async execute(request:CapabilityRequest):Promise<CapabilityResult>{try{
  const {equation,variable}=request.input as {equation:string;variable:string}; if(!equation||!variable)throw new Error("equation and variable are required");
  const value=solveLinear(equation,variable);
  const output:ComputationResult={operation:request.capability,success:true,outputs:[{value,unit:"1",status:"CALCULATED"}],warnings:["Development boundary: bounded linear equations only."],evidence:{equation,assumptions:[],inputs:[],provider:this.id}};
  return {capability:request.capability,provider:this.id,success:true,output};
 }catch(error){return {capability:request.capability,provider:this.id,success:false,error:String(error)};}}
}