import {describe,expect,it} from "vitest";
import {EngineeringSystemModel} from "../src/mbse/model.js";

describe("engineering system model",()=>{
 it("allocates requirements to system elements",()=>{
  const model=new EngineeringSystemModel({id:"SYS",name:"Example system",elements:[],requirements:[{id:"R1",name:"Mass",statement:"Mass shall be limited.",kind:"ENGINEERING",priority:"SHOULD",status:"OPEN"}]});
  model.addElement({id:"SUB",name:"Subsystem",type:"SUBSYSTEM",requirementIds:[]});
  model.allocateRequirement("R1","SUB");
  expect(model.get().elements[0].requirementIds).toContain("R1");
 });
});
