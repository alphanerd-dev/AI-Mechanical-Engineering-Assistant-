import {describe,expect,it} from "vitest";
import {
  ModelBackedEngineeringIntentAdapter,
  StaticModelIntentGenerator,
  validateModelEngineeringIntent
} from "../src/intent/model-adapter.js";
import {createV2_0_15Router} from "../src/benchmarks/v2-0-15.js";
import {runV2_0_16BenchmarkSuite} from "../src/benchmarks/v2-0-16.js";

const raw="Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.";

function completeModelOutput(){
  return {
    raw,
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

describe("V2.0.16 model-backed intent adapter",()=>{
  it("passes the named model-backed benchmark gate",async()=>{
    const report=await runV2_0_16BenchmarkSuite();
    expect(report.suiteId).toBe("engineering-model-backed-intent-v2.0.16");
    expect(report.version).toBe("2.0.16");
    expect(report.failed).toBe(0);
    expect(report.passRate).toBe(1);
  });

  it("accepts structured model intent and exposes only interpretation fields",async()=>{
    const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(completeModelOutput()));
    const result=await adapter.interpret(raw);
    expect(result.completionUnit).toBe("ENGINEERING.COMPLETE_SHAFT");
    expect(result.extractedInputs.powerKw).toBe(5);
    expect(result.extractedInputs.speedRpm).toBe(1500);
    expect(result).not.toHaveProperty("torqueNm");
    expect(result).not.toHaveProperty("minimumDiameterMm");
  });

  it("rejects model engineering-result fields before execution",async()=>{
    const output={...completeModelOutput(),torqueNm:31.8333333333};
    expect(()=>validateModelEngineeringIntent(output,{
      rawIntent:raw,
      instructions:"test"
    })).toThrow("Unsupported model intent field 'torqueNm'");
  });

  it("rejects invented or mis-grounded numeric values",async()=>{
    const output={
      ...completeModelOutput(),
      inputs:[{name:"powerKw",value:6,unit:"kW",source:"USER",sourceText:"5 kW"}]
    };
    const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(output));
    await expect(adapter.interpret(raw)).rejects.toThrow("does not match its source text");
  });

  it("rejects malformed JSON model responses",async()=>{
    const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator("{not-json"));
    await expect(adapter.interpret(raw)).rejects.toThrow();
  });

  it("preserves the single deterministic execution path",async()=>{
    const interpreter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(completeModelOutput()));
    const {router}=createV2_0_15Router(undefined,interpreter);
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{projectId:"V2-0-16-PATH",rawIntent:raw}
    });
    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.decision.validationPassed).toBe(true);
    expect(output.decision.metrics).toEqual(expect.arrayContaining([{key:"torqueNm",value:expect.closeTo(31.8333333333,10),unit:"N·m"}]));
    expect(output.decision.evidenceIds.length).toBe(3);
    expect(output.decision.metrics.length).toBe(3);
    expect(output.completion.validation.passed).toBe(true);
  });

  it("validates context-backed values against supplied project context",async()=>{
    const context={
      projectId:"V2-0-16-CONTEXT",
      knownInputs:{powerKw:5,speedRpm:1500,bendingMomentNm:80,allowableShearStressMpa:55,proposedDiameterMm:30}
    };
    const contextRaw="Verify the proposed shaft diameter using established project requirements.";
    const output={
      raw:contextRaw,
      goal:"shaft design",
      domain:"mechanical",
      completionUnit:"ENGINEERING.COMPLETE_SHAFT",
      inputs:[
        {name:"powerKw",value:5,unit:"kW",source:"CONTEXT",sourceKey:"powerKw"},
        {name:"speedRpm",value:1500,unit:"rpm",source:"CONTEXT",sourceKey:"speedRpm"},
        {name:"bendingMomentNm",value:80,unit:"N·m",source:"CONTEXT",sourceKey:"bendingMomentNm"},
        {name:"allowableShearStressMpa",value:55,unit:"MPa",source:"CONTEXT",sourceKey:"allowableShearStressMpa"},
        {name:"proposedDiameterMm",value:30,unit:"mm",source:"CONTEXT",sourceKey:"proposedDiameterMm"}
      ],
      missingInputs:[],
      requestedCapabilities:["ENGINEERING.COMPLETE_SHAFT"],
      confidence:"HIGH",
      ambiguity:"LOW",
      assumptions:[]
    };
    const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(output));
    const result=await adapter.interpret(contextRaw,context);
    expect(result.contextUsed).toHaveLength(5);
  });
});
