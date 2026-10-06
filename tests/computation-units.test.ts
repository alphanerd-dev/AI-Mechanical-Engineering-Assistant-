import {describe,it,expect} from "vitest";
import {UnitComputationProvider} from "../src/providers/computation-units.js";

describe("engineering units",()=>{
  const p=new UnitComputationProvider();

  it("converts kW to W",async()=>{
    const r=await p.execute({capability:"UNITS.CONVERT",risk:"LOW",input:{value:5,fromUnit:"kW",toUnit:"W"}});
    expect(r.success).toBe(true);
    expect((r.output as any).outputs[0].value).toBe(5000);
  });

  it("rejects incompatible dimensions",async()=>{
    const r=await p.execute({capability:"UNITS.CONVERT",risk:"LOW",input:{value:5,fromUnit:"kW",toUnit:"mm"}});
    expect(r.success).toBe(false);
  });

  it("checks compatible dimensions",async()=>{
    const r=await p.execute({capability:"UNITS.CHECK_DIMENSIONS",risk:"LOW",input:{quantities:[
      {value:5,unit:"kW"},{value:5000,unit:"W"}
    ]}});
    expect(r.success).toBe(true);
    expect((r.output as any).compatible).toBe(true);
  });
});