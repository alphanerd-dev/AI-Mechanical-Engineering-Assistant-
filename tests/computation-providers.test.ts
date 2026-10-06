import {describe,it,expect} from "vitest";
import {DimensionalComputationProvider} from "../src/providers/computation-dimensions.js";
import {SymbolicComputationProvider} from "../src/providers/computation-symbolic.js";
describe("dimensional computation",()=>{
 it("recognizes power dimensions",async()=>{const r=await new DimensionalComputationProvider().execute({capability:"UNITS.CHECK_DIMENSIONS",risk:"LOW",input:{quantities:[{value:5,unit:"kW"},{value:5000,unit:"W"}]}});expect((r.output as any).compatible).toBe(true);});
 it("rejects power versus length",async()=>{const r=await new DimensionalComputationProvider().execute({capability:"UNITS.CHECK_DIMENSIONS",risk:"LOW",input:{quantities:[{value:5,unit:"kW"},{value:10,unit:"mm"}]}});expect((r.output as any).compatible).toBe(false);});
});
describe("symbolic computation",()=>{it("solves a bounded linear equation",async()=>{const r=await new SymbolicComputationProvider().execute({capability:"MATH.SYMBOLIC_SOLVE",risk:"MEDIUM",input:{equation:"2*x+3=9",variable:"x"}});expect(r.success).toBe(true);expect((r.output as any).outputs[0].value).toBe(3);});});