import {SystemParameterSweepCase,SystemParameterSweepRequest} from "./types.js";

export function enumerateParameterSweep(request:SystemParameterSweepRequest):{status:"OK"|"INCOMPLETE";cases:SystemParameterSweepCase[];message:string}{
  const maxSamples=request.maxSamples??10000;
  const axes:number[][]=[];

  for(const variable of request.variables){
    const values:number[]=[];
    const span=variable.upper-variable.lower;
    const count=Math.floor(span/variable.step+1e-12)+1;
    for(let i=0;i<count;i++){
      const value=variable.lower+i*variable.step;
      if(value>variable.upper+1e-9)break;
      values.push(Number(value.toPrecision(14)));
    }
    if(values.length===0)values.push(variable.lower);
    axes.push(values);
  }

  const total=axes.reduce((product,axis)=>product*axis.length,1);
  if(total>maxSamples)return {status:"INCOMPLETE",cases:[],message:"Parameter sweep exceeds the explicit maxSamples ceiling."};

  const cases:SystemParameterSweepCase[]=[];
  const recurse=(depth:number,parameters:Record<string,number>)=>{
    if(depth===request.variables.length){
      cases.push({index:cases.length,parameters:{...parameters}});
      return;
    }
    const variable=request.variables[depth];
    for(const value of axes[depth]){
      parameters[variable.name]=value;
      recurse(depth+1,parameters);
    }
  };
  recurse(0,{...request.baseInput.parameters});
  return {status:"OK",cases,message:"Deterministic parameter sweep cases generated from explicit bounds and steps."};
}
