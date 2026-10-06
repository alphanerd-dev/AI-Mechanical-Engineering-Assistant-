import {RSSToleranceResult,ToleranceStackInput,WorstCaseToleranceResult} from "./types.js";

type UnitInfo={dimension:string;factor:number};
const UNITS:Record<string,UnitInfo>={
  mm:{dimension:"length",factor:1},cm:{dimension:"length",factor:10},m:{dimension:"length",factor:1000},
  um:{dimension:"length",factor:0.001},in:{dimension:"length",factor:25.4},
  deg:{dimension:"angle",factor:1},rad:{dimension:"angle",factor:180/Math.PI}
};
function unit(unitName:string){const u=UNITS[unitName];if(!u)throw new Error("Unsupported tolerance unit: "+unitName);return u;}
function convert(value:number,from:string,to:string){const a=unit(from),b=unit(to);if(a.dimension!==b.dimension)throw new Error("Incompatible tolerance units: "+from+" vs "+to);return value*a.factor/b.factor;}
function finite(n:unknown,label:string){if(typeof n!=="number"||!Number.isFinite(n))throw new Error(label+" must be finite");return n;}

export function worstCaseTolerance(input:ToleranceStackInput):WorstCaseToleranceResult{
  try{
    if(!Array.isArray(input.contributors)||input.contributors.length===0)return {status:"INCOMPLETE",unit:input.unit,message:"At least one tolerance contributor is required."};
    let nominal=0,plus=0,minus=0;
    for(const c of input.contributors){
      finite(c.nominal,c.id+".nominal");finite(c.plus,c.id+".plus");finite(c.minus,c.id+".minus");
      if(c.plus<0||c.minus<0)return {status:"INVALID",unit:input.unit,message:"Plus/minus tolerances must be non-negative."};
      const signed=c.sign??1;if(signed!==1&&signed!==-1)return {status:"INVALID",unit:input.unit,message:"sign must be 1 or -1."};
      const coefficient=c.coefficient??1;if(!Number.isFinite(coefficient)||coefficient===0)return {status:"INVALID",unit:input.unit,message:"coefficient must be finite and non-zero."};
      const n=convert(c.nominal,c.unit,input.unit);const p=convert(c.plus,c.unit,input.unit);const m=convert(c.minus,c.unit,input.unit);
      const direction=coefficient*signed;nominal+=direction*n;
      if(direction>=0){plus+=Math.abs(coefficient)*p;minus+=Math.abs(coefficient)*m;}else{plus+=Math.abs(coefficient)*m;minus+=Math.abs(coefficient)*p;}
    }
    return {status:"VALID",nominal,minimum:nominal-minus,maximum:nominal+plus,plus,minus,unit:input.unit,message:"Worst-case tolerance stack calculated from explicit contributor limits."};
  }catch(e){return {status:"INVALID",unit:input.unit,message:String(e)}}
}

export function rssTolerance(input:ToleranceStackInput):RSSToleranceResult{
  try{
    if(!Array.isArray(input.contributors)||input.contributors.length===0)return {status:"INCOMPLETE",unit:input.unit,message:"At least one tolerance contributor is required."};
    let nominal=0,sum=0;
    for(const c of input.contributors){
      finite(c.nominal,c.id+".nominal");const sigma=c.oneSigma;
      if(sigma===undefined)return {status:"INCOMPLETE",unit:input.unit,message:"RSS requires explicit oneSigma for every contributor; it will not infer a distribution from limits."};
      finite(sigma,c.id+".oneSigma");if(sigma<0)return {status:"INVALID",unit:input.unit,message:"oneSigma must be non-negative."};
      const coefficient=c.coefficient??1;const signed=c.sign??1;
      if(!Number.isFinite(coefficient)||coefficient===0)return {status:"INVALID",unit:input.unit,message:"coefficient must be finite and non-zero."};
      if(signed!==1&&signed!==-1)return {status:"INVALID",unit:input.unit,message:"sign must be 1 or -1."};
      nominal+=coefficient*signed*convert(c.nominal,c.unit,input.unit);
      const s=convert(sigma,c.unit,input.unit);sum+=(coefficient*s)*(coefficient*s);
    }
    const oneSigma=Math.sqrt(sum);
    return {status:"VALID",nominal,oneSigma,plusMinus:oneSigma,minimum:nominal-oneSigma,maximum:nominal+oneSigma,unit:input.unit,message:"RSS stack calculated from explicitly supplied one-sigma values."};
  }catch(e){return {status:"INVALID",unit:input.unit,message:String(e)}}
}
