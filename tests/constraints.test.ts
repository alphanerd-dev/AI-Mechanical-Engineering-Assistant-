import {describe,expect,it} from "vitest";
import {evaluateConstraint} from "../src/constraints/evaluator.js";

describe("constraint evaluation",()=>{
 it("accepts a satisfied bound",()=>{
  const result=evaluateConstraint({id:"C1",name:"Diameter",kind:"BOUND",expression:"20 <= d <= 30",variables:["d"],lower:20,upper:30,status:"OPEN"},{d:25});
  expect(result.satisfied).toBe(true);
 });
 it("reports a violated bound",()=>{
  const result=evaluateConstraint({id:"C1",name:"Diameter",kind:"BOUND",expression:"20 <= d <= 30",variables:["d"],lower:20,upper:30,status:"OPEN"},{d:35});
  expect(result.satisfied).toBe(false);
 });
});
