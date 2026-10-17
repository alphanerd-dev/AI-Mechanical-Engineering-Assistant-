import type {EngineeringContext} from "../experience/context.js";
import type {EngineeringIntentInterpretation,EngineeringIntentInterpreter} from "./types.js";
import {ModelBackedEngineeringIntentAdapter} from "./model-adapter.js";
import {createDefaultDeterministicEngineeringIntentInterpreter} from "./deterministic.js";
import {createConfiguredEngineeringIntentGenerator} from "./http-model-generator.js";

export class ModelWithDeterministicFallback implements EngineeringIntentInterpreter {
  constructor(private readonly primary:EngineeringIntentInterpreter|undefined,private readonly fallback:EngineeringIntentInterpreter,private readonly attemptedModelConfiguration:boolean){}
  async interpret(raw:string,context?:EngineeringContext):Promise<EngineeringIntentInterpretation>{
    if(this.primary){
      try{return {...await this.primary.interpret(raw,context),interpretationSource:"MODEL"};}
      catch{return {...await this.fallback.interpret(raw,context),interpretationSource:"DETERMINISTIC_FALLBACK"};}
    }
    const result=await this.fallback.interpret(raw,context);
    return {...result,interpretationSource:this.attemptedModelConfiguration?"DETERMINISTIC_FALLBACK":"DETERMINISTIC"};
  }
}

/** Optional model interpretation, with deterministic interpretation as the safe default and fallback. */
export function createEngineeringIntentInterpreterFromEnvironment(env:Record<string,string|undefined>=process.env,fetchImpl?:typeof fetch):EngineeringIntentInterpreter{
  const fallback=createDefaultDeterministicEngineeringIntentInterpreter();
  const requested=Boolean(env.ENGINEERING_INTENT_MODEL_URL?.trim()||env.ENGINEERING_INTENT_MODEL_NAME?.trim());
  try{
    const generator=createConfiguredEngineeringIntentGenerator(env,fetchImpl);
    if(!generator)return new ModelWithDeterministicFallback(undefined,fallback,requested);
    return new ModelWithDeterministicFallback(new ModelBackedEngineeringIntentAdapter(generator),fallback,true);
  }catch{return new ModelWithDeterministicFallback(undefined,fallback,true);}
}
