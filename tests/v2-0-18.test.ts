import {describe,expect,it} from "vitest";
import {ModelBackedEngineeringIntentAdapter,StaticModelIntentGenerator} from "../src/intent/model-adapter.js";

describe("V2.0.18 domain-neutral intent contract",()=>{
  it("accepts a non-mechanical structured engineering intent without shaft-specific extraction",async()=>{
    const raw="Analyze a 12 V DC load drawing 2 A.";
    const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator({
      raw,
      goal:"DC load analysis",
      domain:"electrical",
      inputs:[
        {name:"voltageV",value:12,unit:"V",source:"USER",sourceText:"12 V"},
        {name:"currentA",value:2,unit:"A",source:"USER",sourceText:"2 A"}
      ],
      missingInputs:[],
      requestedCapabilities:["ANALYSIS.DC_LOAD"],
      confidence:"HIGH",
      ambiguity:"LOW",
      assumptions:[]
    }));
    const result=await adapter.interpret(raw);
    expect(result.extractedInputs).toEqual({voltageV:12,currentA:2});
    expect(result.completionUnit).toBeUndefined();
    expect(result.goal).toBe("DC load analysis");
  });

  it("preserves the existing shaft intent contract",async()=>{
    const raw="Design a shaft that transmits 5 kW at 1500 rpm.";
    const adapter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator({
      raw,
      goal:"shaft design",
      domain:"mechanical",
      completionUnit:"ENGINEERING.COMPLETE_SHAFT",
      inputs:[
        {name:"powerKw",value:5,unit:"kW",source:"USER",sourceText:"5 kW"},
        {name:"speedRpm",value:1500,unit:"rpm",source:"USER",sourceText:"1500 rpm"}
      ],
      missingInputs:["bending moment","allowable shear stress","proposed shaft diameter"],
      requestedCapabilities:["ENGINEERING.COMPLETE_SHAFT"],
      confidence:"MEDIUM",
      ambiguity:"HIGH",
      assumptions:[]
    }));
    const result=await adapter.interpret(raw);
    expect(result.extractedInputs.powerKw).toBe(5);
    expect(result.extractedInputs.speedRpm).toBe(1500);
  });
});
