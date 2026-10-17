import type {EngineeringContext} from "../experience/context.js";
import type {ModelIntentGenerationRequest,ModelIntentGenerator} from "./model-adapter.js";

export type EngineeringIntentTransportErrorCode =
  | "INTENT_MODEL_NETWORK_ERROR" | "INTENT_MODEL_TIMEOUT" | "INTENT_MODEL_HTTP_ERROR"
  | "INTENT_MODEL_INVALID_RESPONSE" | "INTENT_MODEL_MISSING_CONTENT" | "INTENT_MODEL_INVALID_JSON";
export class EngineeringIntentTransportError extends Error {
  constructor(message:string,readonly code:EngineeringIntentTransportErrorCode){super(message);this.name="EngineeringIntentTransportError";}
}
export interface OpenAICompatibleEngineeringIntentGeneratorOptions {
  endpoint:string; model:string; apiKey?:string; timeoutMs?:number; fetchImpl?:typeof fetch;
}
const MAX_INTENT_LENGTH=8000,MAX_RESPONSE_LENGTH=1_000_000,MAX_CONTEXT_INPUTS=64,MAX_CONTEXT_STRING=512;

/** Optional server-side JSON-mode transport for structured intent interpretation. */
export class OpenAICompatibleEngineeringIntentGenerator implements ModelIntentGenerator {
  private readonly endpoint:string; private readonly model:string; private readonly apiKey?:string;
  private readonly timeoutMs:number; private readonly fetchImpl:typeof fetch;
  constructor(options:OpenAICompatibleEngineeringIntentGeneratorOptions){
    if(!options||typeof options.endpoint!=="string"||!options.endpoint.trim())throw new Error("A configured engineering intent model endpoint is required.");
    if(typeof options.model!=="string"||!options.model.trim())throw new Error("A configured engineering intent model name is required.");
    let url:URL;
    try{url=new URL(options.endpoint);}catch{throw new Error("Engineering intent model endpoint must be an absolute HTTP(S) URL.");}
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("Engineering intent model endpoint must use HTTP(S) without embedded credentials.");
    const timeout=options.timeoutMs??45_000;
    if(!Number.isInteger(timeout)||timeout<1000||timeout>120_000)throw new Error("Engineering intent model timeout must be an integer from 1000 to 120000 milliseconds.");
    this.endpoint=url.toString();this.model=options.model.trim();this.apiKey=options.apiKey?.trim()||undefined;
    this.timeoutMs=timeout;this.fetchImpl=options.fetchImpl??fetch;
  }
  async generate(request:ModelIntentGenerationRequest):Promise<unknown>{
    const rawIntent=request.rawIntent.trim();
    if(!rawIntent||rawIntent.length>MAX_INTENT_LENGTH)throw new EngineeringIntentTransportError("The engineering intent model input must contain 1-8000 characters.","INTENT_MODEL_INVALID_RESPONSE");
    const body={
      model:this.model,temperature:0.1,max_tokens:1800,response_format:{type:"json_object"},
      messages:[
        {role:"system",content:request.instructions},
        {role:"user",content:JSON.stringify({rawIntent,context:safeContext(request.context)})}
      ]
    };
    const headers:Record<string,string>={"content-type":"application/json",accept:"application/json"};
    if(this.apiKey)headers.authorization="Bearer "+this.apiKey;
    const init:RequestInit={method:"POST",headers,signal:AbortSignal.timeout(this.timeoutMs),body:JSON.stringify(body)};
    let response:Response;
    try{response=await this.fetchImpl(this.endpoint,init);}
    catch{
      if(init.signal?.aborted)throw new EngineeringIntentTransportError("The engineering intent model request exceeded its timeout.","INTENT_MODEL_TIMEOUT");
      throw new EngineeringIntentTransportError("The engineering intent model request failed before an HTTP response was received.","INTENT_MODEL_NETWORK_ERROR");
    }
    if(!response.ok)throw new EngineeringIntentTransportError("The configured engineering intent model returned HTTP "+response.status+".","INTENT_MODEL_HTTP_ERROR");
    let responseText:string;
    try{responseText=await readBoundedResponseText(response,MAX_RESPONSE_LENGTH);}
    catch{throw new EngineeringIntentTransportError("The engineering intent model response could not be read or exceeded the size limit.","INTENT_MODEL_INVALID_RESPONSE");}
    let payload:unknown;
    try{payload=JSON.parse(responseText);}catch{throw new EngineeringIntentTransportError("The engineering intent endpoint did not return valid JSON.","INTENT_MODEL_INVALID_RESPONSE");}
    const content=extractMessageContent(payload);
    if(!content)throw new EngineeringIntentTransportError("The engineering intent model response did not contain message content.","INTENT_MODEL_MISSING_CONTENT");
    try{
      const parsed:unknown=JSON.parse(stripJsonFence(content));
      if(typeof parsed!=="object"||parsed===null||Array.isArray(parsed))throw new Error("Expected JSON object.");
      return parsed;
    }catch{throw new EngineeringIntentTransportError("The engineering intent model did not return a JSON object.","INTENT_MODEL_INVALID_JSON");}
  }
}
function safeContext(context:EngineeringContext|undefined):Record<string,unknown>{
  const safeInputs:Record<string,number|string>={},known=context?.knownInputs;
  if(known&&typeof known==="object"){
    for(const [key,value] of Object.entries(known).slice(0,MAX_CONTEXT_INPUTS)){
      if(!key.trim()||key.length>128)continue;
      if(typeof value==="number"&&Number.isFinite(value))safeInputs[key]=value;
      else if(typeof value==="string"&&value.length<=MAX_CONTEXT_STRING)safeInputs[key]=value;
    }
  }
  return {
    ...(typeof context?.projectId==="string"&&context.projectId.length<=128?{projectId:context.projectId}:{}),
    ...(typeof context?.projectStage==="string"&&context.projectStage.length<=128?{projectStage:context.projectStage}:{}),
    knownInputs:safeInputs
  };
}
function extractMessageContent(value:unknown):string|undefined{
  if(typeof value!=="object"||value===null||Array.isArray(value))return undefined;
  const choices=(value as Record<string,unknown>).choices;
  if(!Array.isArray(choices)||choices.length===0)return undefined;
  const first=choices[0];
  if(typeof first!=="object"||first===null||Array.isArray(first))return undefined;
  const message=(first as Record<string,unknown>).message;
  if(typeof message!=="object"||message===null||Array.isArray(message))return undefined;
  const content=(message as Record<string,unknown>).content;
  return typeof content==="string"&&content.trim()?content.trim():undefined;
}
async function readBoundedResponseText(response:Response,maxBytes:number):Promise<string>{
  const stream=response.body;
  if(!stream)return "";
  const reader=stream.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const part=await reader.read();
      if(part.done)break;
      total+=part.value.byteLength;
      if(total>maxBytes){
        await reader.cancel();
        throw new Error("Response exceeded configured size limit.");
      }
      chunks.push(part.value);
    }
  }finally{
    reader.releaseLock();
  }
  const combined=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(combined);
}
function stripJsonFence(content:string):string{
  const fence=String.fromCharCode(96).repeat(3);
  return content.replace(new RegExp("^"+fence+"(?:json)?\\s*","i"),"").replace(new RegExp("\\s*"+fence+"$"),"").trim();
}
export function createConfiguredEngineeringIntentGenerator(env:Record<string,string|undefined>=process.env,fetchImpl?:typeof fetch):OpenAICompatibleEngineeringIntentGenerator|undefined{
  const endpoint=env.ENGINEERING_INTENT_MODEL_URL?.trim(),model=env.ENGINEERING_INTENT_MODEL_NAME?.trim();
  if(!endpoint||!model)return undefined;
  return new OpenAICompatibleEngineeringIntentGenerator({endpoint,model,apiKey:env.ENGINEERING_INTENT_MODEL_API_KEY,timeoutMs:parseTimeout(env.ENGINEERING_INTENT_MODEL_TIMEOUT_MS),fetchImpl});
}
function parseTimeout(value:string|undefined):number{
  if(value===undefined||!value.trim())return 45_000;
  const timeout=Number(value);
  if(!Number.isInteger(timeout)||timeout<1000||timeout>120_000)throw new Error("Engineering intent model timeout must be an integer from 1000 to 120000 milliseconds.");
  return timeout;
}
