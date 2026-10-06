import {describe,it,expect} from "vitest";
import {validateStaticStructural} from "../src/simulation/validation.js";
import {PyMechanicalWorkerProvider} from "../src/providers/pymechanical-worker.js";
describe("simulation validation",()=>{
 it("passes a converged result below yield",()=>{
  const v=validateStaticStructural({converged:true,maxStressMpa:120,maxDisplacementMm:0.4,warnings:[]},250);
  expect(v.pass).toBe(true);
 });
 it("blocks stress above yield",()=>{
  const v=validateStaticStructural({converged:true,maxStressMpa:260,maxDisplacementMm:0.4,warnings:[]},250);
  expect(v.pass).toBe(false);
 });
 it("blocks non-converged results",()=>{
  const v=validateStaticStructural({converged:false,maxStressMpa:120,maxDisplacementMm:0.4,warnings:[]},250);
  expect(v.pass).toBe(false);
 });
 it("keeps FEA execution behind a provider boundary",async()=>{
  const p=new PyMechanicalWorkerProvider({runStaticStructural:async()=>({converged:true,maxStressMpa:100,maxDisplacementMm:0.2,warnings:[]})});
  const r=await p.execute({capability:"ANALYSIS.STATIC_STRUCTURAL",risk:"HIGH",input:{artifactId:"cad-1",material:{name:"steel",yieldStrengthMpa:250},loads:[],constraints:[],mesh:{elementSizeMm:5}}});
  expect(r.success).toBe(true);
 });
});
