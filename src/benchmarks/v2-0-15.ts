import {CapabilityRegistry} from "../capabilities/registry.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {V2_0_10_CAPABILITIES} from "../capabilities/v2-0-10.js";
import {V2_0_11_CAPABILITIES} from "../capabilities/v2-0-11.js";
import {V2_0_12_CAPABILITIES} from "../capabilities/v2-0-12.js";
import {V2_0_14_CAPABILITIES} from "../capabilities/v2-0-14.js";
import {EngineeringCompletionProvider} from "../providers/engineering-completion.js";
import {RiskAdaptiveExperienceProvider} from "../providers/experience.js";
import {EngineeringContextProvider} from "../providers/context.js";
import {AIEngineeringIntentProvider} from "../providers/ai-intent.js";
import {DeterministicShaftIntentInterpreter} from "../intent/shaft.js";
import {EngineeringIntentInterpreter} from "../intent/types.js";
import {InMemoryEngineeringIntentSessionStore} from "../intent/session.js";
import {NumericalAnalysisProvider} from "../providers/numerical.js";
import {BenchmarkCaseDefinition} from "./types.js";
import {runBenchmarkSuite} from "./runner.js";

export function createV2_0_15Router(
  sessionStore=new InMemoryEngineeringIntentSessionStore(),
  interpreter:EngineeringIntentInterpreter=new DeterministicShaftIntentInterpreter()
):{
  router:CapabilityRouter;
  sessionStore:InMemoryEngineeringIntentSessionStore;
}{
  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_10_CAPABILITIES);
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  registry.registerCatalog(V2_0_12_CAPABILITIES);
  registry.registerCatalog(V2_0_14_CAPABILITIES);
  const router=new CapabilityRouter(registry);
  registry.register(new NumericalAnalysisProvider());
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new AIEngineeringIntentProvider(
    router,
    interpreter,
    sessionStore
  ));
  return {router,sessionStore};
}

function run(router:CapabilityRouter,projectId:string,rawIntent:string,sessionId?:string){
  return router.execute({
    capability:"ENGINEERING.ENTER_FROM_INTENT",
    risk:"HIGH",
    input:{projectId,rawIntent,...(sessionId?{sessionId}:{})}
  });
}

function assertDecisionReady(output:any):void{
  const decision=output?.decision;
  if(!decision) throw new Error("Decision-ready result is missing.");
  for(const field of ["status","validationPassed","evidenceIds"]){
    if(!(field in decision)) throw new Error(`Decision-ready field missing: ${field}.`);
  }
  if(!Array.isArray(decision.evidenceIds)) throw new Error("Decision evidenceIds must be an array.");
  if(!decision.nextAction&&!decision.nextQuestion) throw new Error("Decision-ready result requires nextAction or nextQuestion.");
}

export const V2_0_15_BENCHMARK_CASES:readonly BenchmarkCaseDefinition[]=[
  {
    id:"v2-0-15-intent-routing",
    name:"Complete natural intent reaches the canonical shaft completion unit",
    async run(){
      const {router}=createV2_0_15Router();
      const result=await run(router,"V2-0-15-ROUTE","Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.");
      if(!result.success) throw new Error(result.error??"Natural intent routing failed.");
      const output=result.output as any;
      if(output.interpretation.completionUnit!=="ENGINEERING.COMPLETE_SHAFT") throw new Error("Intent did not route to the shaft completion unit.");
      if(output.status!=="WAITING_APPROVAL"||!output.decision.validationPassed) throw new Error("Routed completion did not produce a validated result.");
      assertDecisionReady(output);
      return {metrics:{routed:1,validationPassed:1},evidence:["Natural intent reached ENGINEERING.COMPLETE_SHAFT through the capability router."]};
    }
  },
  {
    id:"v2-0-15-context-reuse",
    name:"Known engineering inputs are reused without unnecessary questions",
    async run(){
      const {router}=createV2_0_15Router();
      const result=await router.execute({
        capability:"ENGINEERING.ENTER_FROM_INTENT",
        risk:"HIGH",
        input:{
          projectId:"V2-0-15-CONTEXT",
          rawIntent:"Verify the proposed shaft diameter using the requirements already established for this project.",
          context:{
            projectId:"V2-0-15-CONTEXT",
            knownInputs:{powerKw:5,speedRpm:1500,bendingMomentNm:80,allowableShearStressMpa:55,proposedDiameterMm:30}
          }
        }
      });
      if(!result.success) throw new Error(result.error??"Context reuse failed.");
      const output=result.output as any;
      if(output.status!=="WAITING_APPROVAL") throw new Error("Known context did not complete the supported workflow.");
      if(output.interpretation.contextUsed.length<5) throw new Error("Known engineering inputs were not all reused.");
      assertDecisionReady(output);
      return {metrics:{contextInputsReused:5,unnecessaryQuestions:0},evidence:["Known project inputs satisfied the material requirements without restating them."]};
    }
  },
  {
    id:"v2-0-15-minimal-escalation",
    name:"Only the first material missing input is requested",
    async run(){
      const {router}=createV2_0_15Router();
      const result=await run(router,"V2-0-15-MISSING","Design a shaft that transmits 5 kW at 1500 rpm. Proposed diameter is 30 mm.");
      if(!result.success) throw new Error(result.error??"Missing-input handling failed.");
      const output=result.output as any;
      if(output.status!=="NEEDS_INPUT"||output.nextQuestion!=="bending moment") throw new Error("The first material gap was not surfaced.");
      if(output.decision.validationPassed||output.decision.evidenceIds.length!==0) throw new Error("Incomplete intent produced a misleading verified decision.");
      assertDecisionReady(output);
      return {metrics:{questionsAsked:1,verifiedEvidenceProduced:0},evidence:["The system escalated only for the first material missing input."]};
    }
  },
  {
    id:"v2-0-15-no-invention",
    name:"Unspecified allowable stress remains unknown",
    async run(){
      const {router}=createV2_0_15Router();
      const result=await run(router,"V2-0-15-NO-INVENTION","Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Proposed diameter is 30 mm. Use whatever allowable stress is appropriate.");
      if(!result.success) throw new Error(result.error??"No-invention case failed.");
      const output=result.output as any;
      if(output.status!=="NEEDS_INPUT"||output.nextQuestion!=="allowable shear stress") throw new Error("The system invented or skipped the missing allowable stress.");
      if(output.decision.evidenceIds.length!==0) throw new Error("No-invention case emitted evidence.");
      assertDecisionReady(output);
      return {metrics:{inventedAllowableStress:0,verifiedEvidenceProduced:0},evidence:["The reference interpreter admitted the missing allowable stress rather than selecting an engineering value."]};
    }
  },
  {
    id:"v2-0-15-fail-closed",
    name:"Failed deterministic verification emits no VERIFIED evidence",
    async run(){
      const {router}=createV2_0_15Router();
      const result=await run(router,"V2-0-15-FAIL","Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 10 mm.");
      if(result.success) throw new Error("Invalid shaft verification unexpectedly succeeded.");
      const output=result.output as any;
      if(output.status!=="FAILED"||output.decision.validationPassed||output.decision.evidenceIds.length!==0) throw new Error("Failed validation was not fail-closed.");
      if((output.completion?.evidence??[]).length!==0) throw new Error("Failed validation emitted evidence.");
      assertDecisionReady(output);
      return {metrics:{validationFailures:1,verifiedEvidenceProduced:0},evidence:["The deterministic validation failure propagated as FAILED with zero evidence."]};
    }
  },
  {
    id:"v2-0-15-multi-turn",
    name:"Partial intent resumes from project-scoped session state",
    async run(){
      const {router,sessionStore}=createV2_0_15Router();
      const first=await run(router,"V2-0-15-MULTI","Design a shaft that transmits 5 kW at 1500 rpm. Proposed diameter is 30 mm.","SESSION-1");
      if(!first.success) throw new Error(first.error??"Initial multi-turn request failed.");
      const firstOutput=first.output as any;
      if(firstOutput.status!=="NEEDS_INPUT"||firstOutput.nextQuestion!=="bending moment") throw new Error("Initial turn did not pause at the first material gap.");
      if(!sessionStore.get("SESSION-1","V2-0-15-MULTI")) throw new Error("Partial intent was not stored project-scoped.");
      const second=await run(router,"V2-0-15-MULTI","Bending is 80 N·m and allowable shear is 55 MPa.","SESSION-1");
      if(!second.success) throw new Error(second.error??"Multi-turn continuation failed.");
      const output=second.output as any;
      if(output.status!=="WAITING_APPROVAL"||!output.decision.validationPassed) throw new Error("Follow-up did not resume the existing completion unit.");
      if(output.interpretation.extractedInputs.powerKw!==5||output.interpretation.extractedInputs.speedRpm!==1500) throw new Error("Continuation did not retain prior project-scoped inputs.");
      assertDecisionReady(output);
      return {metrics:{turns:2,fullIntentRestatementRequired:0,validationPassed:1},evidence:["The second turn resumed the same project-scoped session without restating the original power, speed or diameter."]};
    }
  },
  {
    id:"v2-0-15-wrong-unit",
    name:"Unsupported engineering intent is not silently forced into the shaft unit",
    async run(){
      const {router}=createV2_0_15Router();
      const result=await run(router,"V2-0-15-WRONG","Size a pressure vessel for 10 bar.");
      if(!result.success) throw new Error(result.error??"Wrong-unit routing returned an unexpected provider failure.");
      const output=result.output as any;
      if(output.interpretation.completionUnit!==undefined) throw new Error("Unsupported pressure-vessel intent was mapped to a completion unit.");
      if(output.status!=="NEEDS_INPUT"||!output.decision.nextQuestion?.includes("completion unit")) throw new Error("Unsupported intent did not request clarification.");
      if(output.decision.evidenceIds.length!==0) throw new Error("Unsupported intent emitted evidence.");
      assertDecisionReady(output);
      return {metrics:{wrongUnitForced:0,verifiedEvidenceProduced:0},evidence:["The router refused to force an unsupported pressure-vessel task into the shaft completion unit."]};
    }
  }
];

export async function runV2_0_15BenchmarkSuite(){
  return runBenchmarkSuite("engineering-ai-native-v2.0.15","2.0.15",V2_0_15_BENCHMARK_CASES);
}
