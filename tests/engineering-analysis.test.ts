import {describe,it,expect} from "vitest";
import {sizeSolidShaft} from "../src/engineering/shaft-design.js";
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";
import {validatePositiveEngineeringResult} from "../src/validation/engineering.js";

describe("shaft sizing",()=>{
  it("returns a finite preliminary diameter",()=>{
    const r=sizeSolidShaft({powerKw:5,speedRpm:1500,bendingMomentNm:100,allowableShearStressMpa:40});
    expect(r.torqueNm).toBeCloseTo(31.833,2);
    expect(r.minimumDiameterMm).toBeGreaterThan(0);
    expect(Number.isFinite(r.minimumDiameterMm)).toBe(true);
  });
});
describe("numerical provider",()=>{
  it("executes shaft sizing as a capability",async()=>{
    const p=new NumericalAnalysisProvider();
    const r=await p.execute({capability:"ANALYSIS.SHAFT_SIZE",risk:"MEDIUM",
      input:{powerKw:5,speedRpm:1500,bendingMomentNm:100,allowableShearStressMpa:40}});
    expect(r.success).toBe(true);
  });
});
describe("validation",()=>{
  it("rejects non-positive engineering outputs",()=>{
    expect(validatePositiveEngineeringResult({diameter:-2}).valid).toBe(false);
  });
});
