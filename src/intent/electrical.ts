import {EngineeringContext} from "../experience/context";
import {EngineeringIntentInterpreter,EngineeringIntentInterpretation} from "./types";

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

export function isElectricalIntentCandidate(raw:string,context?:EngineeringContext):boolean{
  const text=raw.toLowerCase();
  const explicitDc=/\b(?:dc|direct current)\b/.test(text);
  const loadLanguage=/\b(?:load|circuit|power|resistance|voltage|current)\b/.test(text);
  const electricalLanguage=/\b(?:electrical|electric)\b/.test(text);
  return explicitDc&&(loadLanguage||electricalLanguage);
}

export class DeterministicElectricalIntentInterpreter implements EngineeringIntentInterpreter{
  async interpret(raw:string,context?:EngineeringContext):Promise<EngineeringIntentInterpretation>{
    const text=raw.trim();
    const lower=text.toLowerCase();
    const voltageV=numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*V(?:\s*DC)?\b/i,text)??contextNumber(context,["voltageV","voltage"]);
    const currentA=numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*A\b/i,text)??contextNumber(context,["currentA","current"]);
    const maximumPowerW=
      numberAfter(/(?:maximum|max|limit|limited(?:\s+to)?)\s+(?:allowable\s+)?power(?:\s+(?:is|of|=|:))?\s*([0-9]+(?:\.[0-9]+)?)\s*W\b/i,text) ??
      contextNumber(context,["maximumPowerW","maxPowerW","powerLimitW"]);

    const extractedInputs:Record<string,number|string>={};
    if(voltageV!==undefined) extractedInputs.voltageV=voltageV;
    if(currentA!==undefined) extractedInputs.currentA=currentA;
    if(maximumPowerW!==undefined) extractedInputs.maximumPowerW=maximumPowerW;

    const missingInputs:string[]=[];
    if(voltageV===undefined) missingInputs.push("voltage");
    if(currentA===undefined) missingInputs.push("current");
    if(maximumPowerW===undefined) missingInputs.push("maximum allowable power");

    const contextUsed:string[]=[];
    for(const [key,value] of Object.entries(extractedInputs)){
      if(!new RegExp(String(value),"i").test(text)) contextUsed.push(key);
    }

    const isCandidate=isElectricalIntentCandidate(text,context);
    const hasAction=/\b(analy[sz]e|calculate|check|verify|design|size|evaluate|determine)\b/i.test(text);
    const completionUnit=isCandidate&&hasAction?"ENGINEERING.COMPLETE_DC_LOAD":undefined;
    const goal=isCandidate?"DC electrical load analysis":"engineering task";
    const ambiguity=missingInputs.length===0?"LOW":missingInputs.length===1?"MEDIUM":"HIGH";
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
