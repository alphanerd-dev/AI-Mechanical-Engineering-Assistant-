import {describe,it,expect} from "vitest";
import {OpenAICompatibleEngineeringIntentGenerator,createConfiguredEngineeringIntentGenerator} from "../src/intent/http-model-generator.js";
import {createEngineeringIntentInterpreterFromEnvironment} from "../src/intent/runtime-interpreter.js";
import type {ModelIntentGenerationRequest} from "../src/intent/model-adapter.js";
const rawIntent="Design a shaft that transmits 5 kW at 1500 rpm.";
const modelOutput={
 raw:rawIntent,goal:"Design a shaft",completionUnit:"ENGINEERING.COMPLETE_SHAFT",
 inputs:[
  {name:"powerKw",value:5,unit:"kW",source:"USER",sourceText:"5 kW"},
  {name:"speedRpm",value:1500,unit:"rpm",source:"USER",sourceText:"1500 rpm"}
 ],
 missingInputs:["bending moment","allowable shear stress","proposed shaft diameter"],
 requestedCapabilities:["ENGINEERING.COMPLETE_SHAFT"],confidence:"HIGH",ambiguity:"MEDIUM",assumptions:[]
};
function request():ModelIntentGenerationRequest{return {rawIntent,context:{projectId:"project-1",projectStage:"DESIGN",knownInputs:{material:"steel",powerKw:5,nested:{secret:"drop"}},recentArtifacts:["artifact-secret"]},instructions:"Return JSON only."};}
function responseFor(output:unknown):Response{return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}),{status:200,headers:{"content-type":"application/json"}});}
describe("OpenAI-compatible engineering intent transport",()=>{
 it("sends bounded project context through server-side JSON-mode transport",async()=>{
  let capturedUrl:RequestInfo|URL|undefined,capturedInit:RequestInit|undefined;
  const generator=new OpenAICompatibleEngineeringIntentGenerator({endpoint:"https://models.example/v1/chat/completions",model:"engineering-intent-model",apiKey:"server-only-token",fetchImpl:async(input,init)=>{capturedUrl=input;capturedInit=init;return responseFor(modelOutput);}});
  expect(await generator.generate(request())).toEqual(modelOutput);
  expect(capturedUrl).toBe("https://models.example/v1/chat/completions");
  expect(capturedInit?.method).toBe("POST");
  expect((capturedInit?.headers as Record<string,string>).authorization).toBe("Bearer server-only-token");
  const body=JSON.parse(String(capturedInit?.body)),user=JSON.parse(body.messages[1].content);
  expect(body.model).toBe("engineering-intent-model");expect(body.response_format).toEqual({type:"json_object"});
  expect(user.rawIntent).toBe(rawIntent);expect(user.context.knownInputs).toEqual({material:"steel",powerKw:5});
  expect(user.context).not.toHaveProperty("recentArtifacts");
  expect(JSON.stringify(body)).not.toContain("artifact-secret");expect(JSON.stringify(body)).not.toContain("nested");
 });
 it("rejects embedded credentials and invalid timeout",()=>{
  expect(()=>new OpenAICompatibleEngineeringIntentGenerator({endpoint:"https://user:password@models.example/chat/completions",model:"m"})).toThrow(/without embedded credentials/);
  expect(()=>new OpenAICompatibleEngineeringIntentGenerator({endpoint:"https://models.example/chat/completions",model:"m",timeoutMs:1})).toThrow(/timeout must be an integer/);
 });
 it("fails closed on missing or malformed model response content",async()=>{
  const missing=new OpenAICompatibleEngineeringIntentGenerator({endpoint:"https://models.example/chat/completions",model:"m",fetchImpl:async()=>new Response(JSON.stringify({choices:[]}),{status:200})});
  await expect(missing.generate(request())).rejects.toMatchObject({name:"EngineeringIntentTransportError",code:"INTENT_MODEL_MISSING_CONTENT"});
  const malformed=new OpenAICompatibleEngineeringIntentGenerator({endpoint:"https://models.example/chat/completions",model:"m",fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:"{bad-json"}}]}),{status:200})});
  await expect(malformed.generate(request())).rejects.toMatchObject({name:"EngineeringIntentTransportError",code:"INTENT_MODEL_INVALID_JSON"});
  const oversized=new OpenAICompatibleEngineeringIntentGenerator({endpoint:"https://models.example/chat/completions",model:"m",fetchImpl:async()=>new Response("x".repeat(1_000_001),{status:200})});
  await expect(oversized.generate(request())).rejects.toMatchObject({name:"EngineeringIntentTransportError",code:"INTENT_MODEL_INVALID_RESPONSE"});
 });
 it("uses deterministic interpretation when no model is configured",async()=>{
  const output=await createEngineeringIntentInterpreterFromEnvironment({}).interpret(rawIntent,{projectId:"project-1"});
  expect(output.interpretationSource).toBe("DETERMINISTIC");expect(output.extractedInputs).toMatchObject({powerKw:5,speedRpm:1500});
 });
 it("uses validated model interpretation when configured",async()=>{
  const interpreter=createEngineeringIntentInterpreterFromEnvironment({ENGINEERING_INTENT_MODEL_URL:"https://models.example/v1/chat/completions",ENGINEERING_INTENT_MODEL_NAME:"intent-model",ENGINEERING_INTENT_MODEL_API_KEY:"server-token"},async()=>responseFor(modelOutput));
  const output=await interpreter.interpret(rawIntent,{projectId:"project-1"});
  expect(output.interpretationSource).toBe("MODEL");expect(output.extractedInputs).toMatchObject({powerKw:5,speedRpm:1500});expect(output.missingInputs).toContain("bending moment");
 });
 it("falls back to deterministic interpretation on transport or provenance failures",async()=>{
  const unavailable=createEngineeringIntentInterpreterFromEnvironment({ENGINEERING_INTENT_MODEL_URL:"https://models.example/v1/chat/completions",ENGINEERING_INTENT_MODEL_NAME:"intent-model"},async()=>{throw new Error("network down");});
  const fallback=await unavailable.interpret(rawIntent,{projectId:"project-1"});
  expect(fallback.interpretationSource).toBe("DETERMINISTIC_FALLBACK");expect(fallback.extractedInputs).toMatchObject({powerKw:5,speedRpm:1500});
  const invented={...modelOutput,inputs:[{name:"powerKw",value:999,unit:"kW",source:"USER",sourceText:"1500 rpm"}]};
  const invalid=createEngineeringIntentInterpreterFromEnvironment({ENGINEERING_INTENT_MODEL_URL:"https://models.example/v1/chat/completions",ENGINEERING_INTENT_MODEL_NAME:"intent-model"},async()=>responseFor(invented));
  const guarded=await invalid.interpret(rawIntent,{projectId:"project-1"});
  expect(guarded.interpretationSource).toBe("DETERMINISTIC_FALLBACK");expect(guarded.extractedInputs).toMatchObject({powerKw:5,speedRpm:1500});expect(guarded.extractedInputs.powerKw).not.toBe(999);
 });
 it("falls back deterministically when model configuration is incomplete or invalid",async()=>{
  const partial=createEngineeringIntentInterpreterFromEnvironment({ENGINEERING_INTENT_MODEL_NAME:"model-without-url"});
  expect((await partial.interpret(rawIntent)).interpretationSource).toBe("DETERMINISTIC_FALLBACK");
  const invalid=createEngineeringIntentInterpreterFromEnvironment({ENGINEERING_INTENT_MODEL_URL:"file:///etc/passwd",ENGINEERING_INTENT_MODEL_NAME:"invalid-endpoint"});
  expect((await invalid.interpret(rawIntent)).interpretationSource).toBe("DETERMINISTIC_FALLBACK");
 });
 it("returns no configured generator unless URL and model are both present",()=>{
  expect(createConfiguredEngineeringIntentGenerator({})).toBeUndefined();
  expect(createConfiguredEngineeringIntentGenerator({ENGINEERING_INTENT_MODEL_URL:"https://models.example/v1/chat/completions"})).toBeUndefined();
 });
});
