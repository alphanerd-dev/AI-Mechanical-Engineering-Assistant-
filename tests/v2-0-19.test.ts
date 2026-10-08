import {describe,expect,it} from "vitest";
import {createV2_0_15Router} from "../src/benchmarks/v2-0-15.js";

describe("V2.0.19 domain-neutral engineering decision contract",()=>{
  it("emits generic metrics instead of shaft-specific decision fields",async()=>{
    const {router}=createV2_0_15Router();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"V2-0-19-SHAFT",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm."
      }
    });
    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.decision.metrics).toEqual(expect.arrayContaining([
      {key:"torqueNm",value:expect.closeTo(31.8333333333,10),unit:"N·m"},
      {key:"minimumDiameterMm",value:expect.any(Number),unit:"mm"},
      {key:"proposedDiameterMm",value:30,unit:"mm"}
    ]));
    expect(output.decision).not.toHaveProperty("torqueNm");
    expect(output.decision).not.toHaveProperty("minimumDiameterMm");
    expect(output.decision).not.toHaveProperty("proposedDiameterMm");
  });

  it("keeps the needs-input contract domain-neutral",async()=>{
    const {router}=createV2_0_15Router();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"V2-0-19-MISSING",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm."
      }
    });
    const decision=(result.output as any).decision;
    expect(decision.status).toBe("NEEDS_INPUT");
    expect(decision.metrics).toEqual([]);
    expect(Array.isArray(decision.evidenceIds)).toBe(true);
    expect(decision.nextQuestion).toBe("bending moment");
  });
});
