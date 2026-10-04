import {describe,it,expect} from "vitest";
import {shaftTorque} from "../src/engineering/calculations.js";
import {EngineeringAgent} from "../src/core/agent.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {MockCADProvider} from "../src/providers/mock-cad.js";

describe("shaft calculation",()=>{
  it("calculates 5 kW at 1500 rpm",()=>{
    expect(shaftTorque(5,1500).torqueNm).toBeCloseTo(31.833,2);
  });
});
describe("engineering agent benchmark",()=>{
  it("identifies known and missing design information",()=>{
    const agent=new EngineeringAgent(new CapabilityRouter(new CapabilityRegistry()));
    const r=agent.start("Design a shaft that transmits 5 kW at 1500 rpm.");
    expect(r.torque?.torqueNm).toBeCloseTo(31.833,2);
    expect(r.project.openQuestions).toContain("material");
    expect(r.project.stage).toBe("PRELIMINARY_ANALYSIS");
  });
});
describe("capability routing",()=>{
  it("routes CAD work to a provider",async()=>{
    const registry=new CapabilityRegistry(); registry.register(new MockCADProvider());
    const result=await new CapabilityRouter(registry).execute({
      capability:"CAD.CREATE_PART",input:{name:"shaft"},risk:"LOW"
    });
    expect(result.success).toBe(true); expect(result.provider).toBe("mock-cad");
  });
});
