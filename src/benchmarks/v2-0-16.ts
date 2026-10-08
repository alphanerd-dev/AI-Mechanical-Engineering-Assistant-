import {EngineeringIntentInterpreter} from "../intent/types.js";
import {ModelBackedEngineeringIntentAdapter,StaticModelIntentGenerator} from "../intent/model-adapter.js";
import {createV2_0_15Router} from "./v2-0-15.js";
import {BenchmarkCaseDefinition} from "./types.js";
import {runBenchmarkSuite} from "./runner.js";

const COMPLETE_INTENT="Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.";

function completeModelOutput():Record<string,unknown>{
  return {
    raw:COMPLETE_INTENT,
    goal:"shaft design",
    domain:"mechanical",
    completionUnit:"ENGINEERING.COMPLETE_SHAFT",
    inputs:[
      {name:"powerKw",value:5,unit:"kW",source:"USER",sourceText:"5 kW"},
      {name:"speedRpm",value:1500,unit:"rpm",source:"USER",sourceText:"1500 rpm"},
      {name:"bendingMomentNm",value:80,unit:"N·m",source:"USER",sourceText:"80 N·m"},
      {name:"allowableShearStressMpa",value:55,unit:"MPa",source:"USER",sourceText:"55 MPa"},
      {name:"proposedDiameterMm",value:30,unit:"mm",source:"USER",sourceText:"30 mm"}
    ],
    missingInputs:[],
    requestedCapabilities:["ENGINEERING.COMPLETE_SHAFT"],
    confidence:"HIGH",
    ambiguity:"LOW",
    assumptions:[]
  };
}

function runWithGenerator(generator:StaticModelIntentGenerator){
  const interpreter:EngineeringIntentInterpreter=new ModelBackedEngineeringIntentAdapter(generator);
  return createV2_0_15Router(undefined,interpreter);
}

export const V2_0_16_BENCHMARK_CASES:readonly BenchmarkCaseDefinition[]=[
  {
    id:"v2-0-16-model-routing",
    name:"Model-backed structured intent reaches the canonical completion unit",
    async run(){
      const {router}=runWithGenerator(new StaticModelIntentGenerator(completeModelOutput()));
      const result=await router.execute({
        capability:"ENGINEERING.ENTER_FROM_INTENT",
        risk:"HIGH",
        input:{projectId:"V2-0-16-MODEL",rawIntent:COMPLETE_INTENT}
      });
      if(!result.success) throw new Error(result.error??"Model-backed intent routing failed.");
      const output=result.output as any;
      if(output.status!=="WAITING_APPROVAL"||!output.decision.validationPassed) throw new Error("Model-backed intent did not reach a validated completion.");
      if(output.decision.torqueNm===undefined||output.decision.minimumDiameterMm===undefined) throw new Error("Decision-ready deterministic results are missing.");
      return {metrics:{modelInterpreted:1,deterministicValidationPassed:1},evidence:["The model adapter supplied structure only; the canonical shaft completion provider produced the engineering decision."]};
    }
  },
  {
    id:"v2-0-16-malformed-output",
    name:"Malformed model output fails closed before engineering execution",
    async run(){
      const bad={raw:COMPLETE_INTENT,goal:"shaft design",inputs:[],missingInputs:[],requestedCapabilities:[],confidence:"HIGH",ambiguity:"LOW",assumptions:[],torqueNm:31.8};
      const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(bad));
      let failed=false;
      try{
        await adapter.interpret(COMPLETE_INTENT);
      }catch(error){
        failed=error instanceof Error&&error.message.includes("Unsupported model intent field 'torqueNm'");
      }
      if(!failed) throw new Error("Malformed model output was not rejected.");
      return {metrics:{malformedOutputsRejected:1,engineeringExecutionStarted:0},evidence:["Schema validation rejects engineering-result fields before the deterministic core is reachable."]};
    }
  },
  {
    id:"v2-0-16-no-invention",
    name:"Unverifiable model-extracted user value is rejected",
    async run(){
      const bad={
        ...completeModelOutput(),
        inputs:[
          {name:"powerKw",value:6,unit:"kW",source:"USER",sourceText:"5 kW"}
        ]
      };
      const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(bad));
      let failed=false;
      try{
        await adapter.interpret(COMPLETE_INTENT);
      }catch(error){
        failed=error instanceof Error&&error.message.includes("does not match its source text");
      }
      if(!failed) throw new Error("Unproven model value was accepted.");
      return {metrics:{inventedInputsAccepted:0,provenanceRejected:1},evidence:["Numeric model inputs must agree with the exact user-provided source text."]};
    }
  },
  {
    id:"v2-0-16-context-provenance",
    name:"Context-backed model inputs must match project context",
    async run(){
      const raw="Verify the proposed shaft diameter using the established project requirements.";
      const context={
        projectId:"V2-0-16-CONTEXT",
        knownInputs:{powerKw:5,speedRpm:1500,bendingMomentNm:80,allowableShearStressMpa:55,proposedDiameterMm:30}
      };
      const output={
        raw,goal:"shaft design",domain:"mechanical",completionUnit:"ENGINEERING.COMPLETE_SHAFT",
        inputs:[
          {name:"powerKw",value:5,unit:"kW",source:"CONTEXT",sourceKey:"powerKw"},
          {name:"speedRpm",value:1500,unit:"rpm",source:"CONTEXT",sourceKey:"speedRpm"},
          {name:"bendingMomentNm",value:80,unit:"N·m",source:"CONTEXT",sourceKey:"bendingMomentNm"},
          {name:"allowableShearStressMpa",value:55,unit:"MPa",source:"CONTEXT",sourceKey:"allowableShearStressMpa"},
          {name:"proposedDiameterMm",value:30,unit:"mm",source:"CONTEXT",sourceKey:"proposedDiameterMm"}
        ],
        missingInputs:[],requestedCapabilities:["ENGINEERING.COMPLETE_SHAFT"],confidence:"HIGH",ambiguity:"LOW",assumptions:[]
      };
      const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(output));
      const interpretation=await adapter.interpret(raw,context);
      if(interpretation.contextUsed.length!==5) throw new Error("Not all context-backed inputs were recorded.");
      return {metrics:{contextInputsValidated:5,contextInventedInputs:0},evidence:["Context provenance is validated against the supplied knownInputs map."]};
    }
  },
  {
    id:"v2-0-16-unsupported-unit",
    name:"Model does not force an unsupported domain into the shaft unit",
    async run(){
      const raw="Size a pressure vessel for 10 bar.";
      const output={
        raw,goal:"pressure vessel sizing",domain:"pressure_vessel",completionUnit:"ENGINEERING.COMPLETE_PRESSURE_VESSEL",
        inputs:[{name:"pressureBar",value:10,unit:"bar",source:"USER",sourceText:"10 bar"}],
        missingInputs:[],requestedCapabilities:["ENGINEERING.COMPLETE_PRESSURE_VESSEL"],confidence:"HIGH",ambiguity:"LOW",assumptions:[]
      };
      const interpreter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(output));
      const {router}=createV2_0_15Router(undefined,interpreter);
      const result=await router.execute({capability:"ENGINEERING.ENTER_FROM_INTENT",risk:"HIGH",input:{projectId:"V2-0-16-WRONG",rawIntent:raw}});
      if(!result.success) throw new Error(result.error??"Unsupported model intent failed unexpectedly.");
      const response=result.output as any;
      if(response.status!=="NEEDS_INPUT"||response.decision.evidenceIds.length!==0) throw new Error("Unsupported model intent was forced into an engineering completion.");
      return {metrics:{wrongUnitForced:0,verifiedEvidenceProduced:0},evidence:["The model-selected completion unit remains subject to the existing supported-unit gate."]};
    }
  }
];

export async function runV2_0_16BenchmarkSuite(){
  return runBenchmarkSuite("engineering-model-backed-intent-v2.0.16","2.0.16",V2_0_16_BENCHMARK_CASES);
}
