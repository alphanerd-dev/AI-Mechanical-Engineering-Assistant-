import {describe,expect,it} from "vitest";
import {runV2_0_15BenchmarkSuite,createV2_0_15Router} from "../src/benchmarks/v2-0-15.js";

function expectDecisionContract(output:any):void{
  expect(output.decision).toBeDefined();
  expect(output.decision).toHaveProperty("status");
  expect(output.decision).toHaveProperty("validationPassed");
  expect(output.decision).toHaveProperty("evidenceIds");
  expect(Array.isArray(output.decision.evidenceIds)).toBe(true);
  expect(output.decision.nextAction??output.decision.nextQuestion).toBeTruthy();
}

describe("V2.0.15 AI-native completion path acceptance gate",()=>{
  it("passes all seven product acceptance cases",async()=>{
    const report=await runV2_0_15BenchmarkSuite();
    expect(report.suiteId).toBe("engineering-ai-native-v2.0.15");
    expect(report.version).toBe("2.0.15");
    expect(report.cases).toHaveLength(7);
    expect(report.failed).toBe(0);
    expect(report.passRate).toBe(1);
  });

  it("enforces the decision-ready contract on success, needs-input and failure paths",async()=>{
    const {router}=createV2_0_15Router();
    const requests=[
      "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.",
      "Design a shaft that transmits 5 kW at 1500 rpm. Proposed diameter is 30 mm.",
      "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 10 mm."
    ];
    const results=await Promise.all(requests.map((rawIntent,index)=>router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{projectId:`V2-0-15-CONTRACT-${index}`,rawIntent}
    })));
    for(const result of results) expectDecisionContract(result.output as any);
  });

  it("keeps the reference interpreter as structure extraction rather than engineering authority",async()=>{
    const {router}=createV2_0_15Router();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"V2-0-15-INVARIANT",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm."
      }
    });
    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.interpretation).not.toHaveProperty("torqueNm");
    expect(output.interpretation).not.toHaveProperty("minimumDiameterMm");
    expect(output.decision.torqueNm).toBeCloseTo(31.8333333333,10);
    expect(output.decision.validationPassed).toBe(true);
  });

  it("does not create a second engineering execution path",async()=>{
    const {router}=createV2_0_15Router();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"V2-0-15-ROUTER",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm."
      }
    });
    const output=result.output as any;
    expect(result.success).toBe(true);
    expect(output.completion.validation.passed).toBe(true);
    expect(output.completion.evidence).toHaveLength(3);
    expect(output.decision.evidenceIds).toEqual(output.completion.lineage.evidenceIds);
  });
});
