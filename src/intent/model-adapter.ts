import {EngineeringIntent,EngineeringIntentInput} from "../core/types.js";
import {EngineeringContext} from "../experience/context.js";
import {ShaftEngineeringCompletionRequest} from "../completion/types.js";
import {EngineeringIntentInterpreter,EngineeringIntentInterpretation} from "./types.js";

export interface ModelIntentGenerationRequest{
  rawIntent:string;
  context?:EngineeringContext;
  instructions:string;
}

export interface ModelIntentGenerator{
  generate(request:ModelIntentGenerationRequest):Promise<unknown>;
}

const ALLOWED_OUTPUT_KEYS=new Set([
  "raw","goal","domain","completionUnit","inputs","missingInputs",
  "requestedCapabilities","confidence","ambiguity","assumptions"
]);

const SHAFT_INPUT_KEYS=new Set<string>([
  "powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa","proposedDiameterMm"
]);

function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==="object"&&value!==null&&!Array.isArray(value);
}

function normalizeText(value:string):string{
  return value.trim().replace(/\s+/g," ").toLowerCase();
}

function parseJsonOutput(output:unknown):Record<string,unknown>{
  const parsed=typeof output==="string"?JSON.parse(output):output;
  if(!isRecord(parsed)) throw new Error("Model intent output must be a JSON object.");
  return parsed;
}

function requireString(value:unknown,name:string):string{
  if(typeof value!=="string"||!value.trim()) throw new Error(`Model intent field '${name}' must be a non-empty string.`);
  return value.trim();
}

function requireStringArray(value:unknown,name:string):string[]{
  if(!Array.isArray(value)||value.some(item=>typeof item!=="string"||!item.trim()))
    throw new Error(`Model intent field '${name}' must be an array of non-empty strings.`);
  return [...new Set(value.map(item=>(item as string).trim()))];
}

function parseConfidence(value:unknown,name:string):"LOW"|"MEDIUM"|"HIGH"{
  if(value!=="LOW"&&value!=="MEDIUM"&&value!=="HIGH")
    throw new Error(`Model intent field '${name}' must be LOW, MEDIUM or HIGH.`);
  return value;
}

function numericToken(value:number,text:string):boolean{
  const numbers=[...text.matchAll(/-?\d+(?:\.\d+)?/g)].map(match=>Number(match[0]));
  return numbers.some(candidate=>Number.isFinite(candidate)&&Math.abs(candidate-value)<=Number.EPSILON*Math.max(1,Math.abs(value)));
}

function validateInputProvenance(
  input:EngineeringIntentInput,
  rawIntent:string,
  context:EngineeringContext|undefined
):void{
  const hasValue=input.value!==undefined;
  if(input.source==="UNKNOWN"){
    if(hasValue) throw new Error(`Model intent invented a value for unknown input '${input.name}'.`);
    if(input.sourceKey!==undefined||input.sourceText!==undefined)
      throw new Error(`Unknown input '${input.name}' cannot declare a source.`);
    return;
  }

  if(!hasValue) throw new Error(`Known model input '${input.name}' must include a value.`);

  if(input.source==="USER"){
    if(!input.sourceText||!normalizeText(rawIntent).includes(normalizeText(input.sourceText)))
      throw new Error(`User input '${input.name}' is not grounded in the supplied intent text.`);
    if(typeof input.value==="number"&&!numericToken(input.value,input.sourceText))
      throw new Error(`User numeric input '${input.name}' does not match its source text.`);
    if(input.sourceKey!==undefined)
      throw new Error(`User input '${input.name}' must not declare a context sourceKey.`);
    return;
  }

  if(!input.sourceKey||!context?.knownInputs||!(input.sourceKey in context.knownInputs))
    throw new Error(`Context input '${input.name}' is missing a valid sourceKey.`);
  const contextValue=context.knownInputs[input.sourceKey];
  if(contextValue!==input.value)
    throw new Error(`Context input '${input.name}' does not match the supplied context value.`);
  if(input.sourceText!==undefined)
    throw new Error(`Context input '${input.name}' must not use sourceText.`);
}

export function buildModelIntentInstructions():string{
  return [
    "Return JSON only. Do not use markdown or prose outside the JSON object.",
    "Interpret the user's engineering intent; do not calculate, verify, size, simulate or approve anything.",
    "Return only information grounded in the user intent or the supplied context.",
    "For every input, declare source USER, CONTEXT or UNKNOWN.",
    "USER inputs require sourceText copied from the user intent. CONTEXT inputs require sourceKey matching a supplied knownInputs key. UNKNOWN inputs must omit value.",
    "Never emit torqueNm, minimumDiameterMm, validationPassed, evidenceIds, artifactIds, pass/fail results or any other engineering result.",
    "Use completionUnit only when the intent clearly maps to a known completion workflow; otherwise omit it.",
    "Use confidence and ambiguity to describe interpretation uncertainty, not engineering correctness.",
    "Do not turn assumptions into known inputs."
  ].join(" ");
}

export function validateModelEngineeringIntent(
  output:unknown,
  request:ModelIntentGenerationRequest
):EngineeringIntent{
  let parsed:Record<string,unknown>;
  try{
    parsed=parseJsonOutput(output);
  }catch(error){
    throw new Error(error instanceof Error?error.message:"Model intent JSON could not be parsed.");
  }

  for(const key of Object.keys(parsed)){
    if(!ALLOWED_OUTPUT_KEYS.has(key)) throw new Error(`Unsupported model intent field '${key}'.`);
  }

  const raw=requireString(parsed.raw,"raw");
  if(raw!==request.rawIntent.trim()) throw new Error("Model intent raw field must exactly match the submitted intent.");

  const goal=requireString(parsed.goal,"goal");
  const domain=parsed.domain===undefined?undefined:requireString(parsed.domain,"domain");
  const completionUnit=parsed.completionUnit===undefined?undefined:requireString(parsed.completionUnit,"completionUnit");
  if(!Array.isArray(parsed.inputs)) throw new Error("Model intent field 'inputs' must be an array.");

  const inputs:EngineeringIntentInput[]=[];
  const names=new Set<string>();
  for(const item of parsed.inputs){
    if(!isRecord(item)) throw new Error("Each model intent input must be an object.");
    for(const key of Object.keys(item)){
      if(!["name","value","unit","source","sourceKey","sourceText"].includes(key))
        throw new Error(`Unsupported model intent input field '${key}'.`);
    }
    const name=requireString(item.name,"inputs[].name");
    if(names.has(name)) throw new Error(`Duplicate model intent input '${name}'.`);
    names.add(name);

    const source=item.source;
    if(source!=="USER"&&source!=="CONTEXT"&&source!=="UNKNOWN")
      throw new Error(`Model intent input '${name}' must declare USER, CONTEXT or UNKNOWN source.`);

    if(item.value!==undefined&&typeof item.value!=="number"&&typeof item.value!=="string")
      throw new Error(`Model intent input '${name}' value must be a number or string.`);
    if(item.unit!==undefined&&typeof item.unit!=="string")
      throw new Error(`Model intent input '${name}' unit must be a string.`);
    if(item.sourceKey!==undefined&&typeof item.sourceKey!=="string")
      throw new Error(`Model intent input '${name}' sourceKey must be a string.`);
    if(item.sourceText!==undefined&&typeof item.sourceText!=="string")
      throw new Error(`Model intent input '${name}' sourceText must be a string.`);

    const input:EngineeringIntentInput={
      name,
      ...(item.value!==undefined?{value:item.value as number|string}:{}),
      ...(item.unit!==undefined?{unit:item.unit as string}:{}),
      source,
      ...(item.sourceKey!==undefined?{sourceKey:item.sourceKey as string}:{}),
      ...(item.sourceText!==undefined?{sourceText:item.sourceText as string}:{})
    };
    validateInputProvenance(input,request.rawIntent,request.context);
    inputs.push(input);
  }

  const missingInputs=requireStringArray(parsed.missingInputs??[],"missingInputs");
  const requestedCapabilities=requireStringArray(parsed.requestedCapabilities??[],"requestedCapabilities");
  const confidence=parseConfidence(parsed.confidence,"confidence");
  const ambiguity=parseConfidence(parsed.ambiguity,"ambiguity");
  const assumptions=requireStringArray(parsed.assumptions??[],"assumptions");

  const knownInputs:Record<string,number|string>={};
  for(const input of inputs){
    if(input.source!=="UNKNOWN"&&input.value!==undefined) knownInputs[input.name]=input.value;
  }

  return {
    raw,
    goal,
    domain,
    completionUnit,
    inputs,
    knownInputs,
    missingInputs,
    requestedCapabilities,
    confidence,
    ambiguity,
    assumptions
  };
}

export class ModelBackedEngineeringIntentAdapter implements EngineeringIntentInterpreter{
  constructor(private readonly generator:ModelIntentGenerator){}

  async interpret(raw:string,context?:EngineeringContext):Promise<EngineeringIntentInterpretation>{
    const request:ModelIntentGenerationRequest={
      rawIntent:raw.trim(),
      context,
      instructions:buildModelIntentInstructions()
    };
    const intent=validateModelEngineeringIntent(
      await this.generator.generate(request),
      request
    );

    const extractedInputs:Partial<ShaftEngineeringCompletionRequest>={};
    for(const input of intent.inputs??[]){
      if(SHAFT_INPUT_KEYS.has(input.name)&&typeof input.value==="number"){
        const key=input.name as keyof Pick<ShaftEngineeringCompletionRequest,
          "powerKw"|"speedRpm"|"bendingMomentNm"|"allowableShearStressMpa"|"proposedDiameterMm">;
        extractedInputs[key]=input.value;
      }
    }

    return {
      raw:intent.raw,
      goal:intent.goal,
      completionUnit:intent.completionUnit,
      extractedInputs,
      missingInputs:intent.missingInputs,
      confidence:intent.confidence??"LOW",
      ambiguity:intent.ambiguity??"HIGH",
      contextUsed:intent.inputs?.filter(input=>input.source==="CONTEXT").map(input=>input.name)??[],
      assumptions:intent.assumptions??[]
    };
  }
}

export class StaticModelIntentGenerator implements ModelIntentGenerator{
  constructor(private readonly output:unknown){}

  async generate():Promise<unknown>{
    return this.output;
  }
}
