import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {ComputationInput,ComputationRequest,ComputationResult} from "../computation/types.js";

const UNIT_FACTORS:Record<string,{dimension:string;factor:number}>={
  mm:{dimension:"length",factor:0.001}, cm:{dimension:"length",factor:0.01}, m:{dimension:"length",factor:1},
  s:{dimension:"time",factor:1}, min:{dimension:"time",factor:60},
  Pa:{dimension:"pressure",factor:1}, kPa:{dimension:"pressure",factor:1000}, MPa:{dimension:"pressure",factor:1e6},
  W:{dimension:"power",factor:1}, kW:{dimension:"power",factor:1000},
  N:{dimension:"force",factor:1}, kN:{dimension:"force",factor:1000},
  "N·m":{dimension:"torque",factor:1}, "N*m":{dimension:"torque",factor:1},
  deg:{dimension:"angle",factor:1}, rad:{dimension:"angle",factor:1}
};

function unitInfo(unit:string){
  const info=UNIT_FACTORS[unit];
  if(!info) throw new Error(`Unsupported unit: ${unit}`);
  return info;
}

function result(operation:string,output:ComputationResult["outputs"],inputs:ComputationInput[],equation?:string):ComputationResult{
  return {
    operation,success:true,outputs:output,warnings:[],
    evidence:{equation,assumptions:[],inputs,provider:"computation.typescript-units"}
  };
}

export class UnitComputationProvider implements CapabilityProvider {
  id="computation.typescript-units";
  capabilities=["UNITS.CONVERT","UNITS.CHECK_DIMENSIONS"];

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      if(request.capability==="UNITS.CONVERT"){
        const {value,fromUnit,toUnit}=request.input as {value:number;fromUnit:string;toUnit:string};
        const from=unitInfo(fromUnit),to=unitInfo(toUnit);
        if(from.dimension!==to.dimension) throw new Error(`Incompatible dimensions: ${from.dimension} vs ${to.dimension}`);
        const converted=value*from.factor/to.factor;
        const computation=result(request.capability,[{value:converted,unit:toUnit,status:"CALCULATED"}],[
          {name:"value",value,unit:fromUnit,status:"KNOWN"}
        ],`value × factor(${fromUnit}) / factor(${toUnit})`);
        return {capability:request.capability,provider:this.id,success:true,output:computation};
      }
      if(request.capability==="UNITS.CHECK_DIMENSIONS"){
        const quantities=request.input.quantities as Array<{value:number;unit:string}>;
        if(!Array.isArray(quantities)||quantities.length===0) throw new Error("quantities must be a non-empty array");
        const dimensions=quantities.map(q=>unitInfo(q.unit).dimension);
        const compatible=dimensions.every(d=>d===dimensions[0]);
        const computation=result(request.capability,[{value:compatible?1:0,unit:"boolean",status:"CALCULATED"}],
          quantities.map((q,i)=>({name:`quantity_${i+1}`,value:q.value,unit:q.unit,status:"KNOWN"})));
        return {capability:request.capability,provider:this.id,success:true,output:{...computation,compatible,dimensions}};
      }
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported unit capability"};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}