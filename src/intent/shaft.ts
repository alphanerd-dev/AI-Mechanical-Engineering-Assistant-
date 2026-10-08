import {EngineeringContext} from "../experience/context.js";
import {EngineeringIntentInterpreter,EngineeringIntentInterpretation} from "./types.js";

function numberAfter(pattern:RegExp,raw:string):number|undefined{
  const match=raw.match(pattern);
  return match?Number(match[1]):undefined;
}

function contextNumber(context:EngineeringContext|undefined,keys:string[]):number|undefined{
  for(const key of keys){
    const value=context?.knownInputs?.[key];
    if(typeof value==="number"&&Number.isFinite(value)) return value;
  }
  return undefined;
}

function contextString(context:EngineeringContext|undefined,key:string):string|undefined{
  const value=context?.knownInputs?.[key];
  return typeof value==="string"&&value.trim()?value.trim():undefined;
}

export class DeterministicShaftIntentInterpreter implements EngineeringIntentInterpreter{
  async interpret(raw:string,context?:EngineeringContext):Promise<EngineeringIntentInterpretation>{
    const text=raw.trim();
    const lower=text.toLowerCase();
    const projectId=typeof context?.projectId==="string"&&context.projectId.trim()?context.projectId.trim():undefined;
    const powerKw=numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*kW\b/i,text)??contextNumber(context,["powerKw","power"]);
    const speedRpm=numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*rpm\b/i,text)??contextNumber(context,["speedRpm","speed"]);
    const bendingMomentNm=numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*N(?:·|\.)?\s*m\b/i,text)??contextNumber(context,["bendingMomentNm","bending moment"]);
    const allowableShearStressMpa=numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i,text)??contextNumber(context,["allowableShearStressMpa","allowable shear stress"]);
    const proposedDiameterMm=numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*mm\b/i,text)??contextNumber(context,["proposedDiameterMm","proposed shaft diameter","diameter"]);

    const extractedInputs={
      ...(projectId?{projectId}:{}),
      ...(powerKw!==undefined?{powerKw}:{}),
      ...(speedRpm!==undefined?{speedRpm}:{}),
      ...(bendingMomentNm!==undefined?{bendingMomentNm}:{}),
      ...(allowableShearStressMpa!==undefined?{allowableShearStressMpa}:{}),
      ...(proposedDiameterMm!==undefined?{proposedDiameterMm}:{})
    };

    const missingInputs:string[]=[];
    if(powerKw===undefined) missingInputs.push("power");
    if(speedRpm===undefined) missingInputs.push("speed");
    if(bendingMomentNm===undefined) missingInputs.push("bending moment");
    if(allowableShearStressMpa===undefined) missingInputs.push("allowable shear stress");
    if(proposedDiameterMm===undefined) missingInputs.push("proposed shaft diameter");

    const contextUsed:string[]=[];
    for(const key of ["powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa","proposedDiameterMm"]){
      if((extractedInputs as Record<string,unknown>)[key]!==undefined&&!new RegExp(String((extractedInputs as Record<string,unknown>)[key]),"i").test(text)){
        contextUsed.push(key);
      }
    }
    if(contextString(context,"material")) contextUsed.push("material");

    const goal=/\b(shaft|shaft design|shaft sizing)\b/i.test(text)?"shaft design":"engineering task";
    const completionUnit=goal==="shaft design"&&
      /\bdesign\b|\bsize\b|\bverify\b|\btransmit\b/i.test(lower)
      ?"ENGINEERING.COMPLETE_SHAFT":undefined;

    const ambiguity=missingInputs.length===0?"LOW":missingInputs.length<=2?"MEDIUM":"HIGH";
    const confidence=completionUnit&&missingInputs.length===0?"HIGH":completionUnit?"MEDIUM":"LOW";

    return {
      raw:text,
      goal,
      completionUnit,
      extractedInputs,
      missingInputs,
      confidence,
      ambiguity,
      contextUsed:[...new Set(contextUsed)],
      assumptions:[]
    };
  }
}
