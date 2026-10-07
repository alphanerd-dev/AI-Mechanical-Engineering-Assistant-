import {describe,expect,it} from "vitest";
import {resolveEngineeringContext} from "../src/experience/context.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {EngineeringContextProvider} from "../src/providers/context.js";

describe("V2.0.12 context-aware interaction",()=>{
  it("uses known context instead of asking the engineer again",()=>{
    const result=resolveEngineeringContext({
      intent:"DESIGN",risk:"MEDIUM",consequence:"PROJECT_STATE",ambiguity:"LOW",
      missingInputs:["material","shaft length","allowable stress"],
      context:{knownInputs:{material:"AISI 1045", "shaft length":500}}
    });
    expect(result.contextUsed).toEqual(["material","shaft length"]);
    expect(result.missingInputs).toEqual(["allowable stress"]);
    expect(result.effectiveRequest.missingInputs).toEqual(["allowable stress"]);
  });

  it("does not invent values when context does not contain them",()=>{
    const result=resolveEngineeringContext({
      intent:"DESIGN",risk:"HIGH",consequence:"PROJECT_STATE",ambiguity:"MEDIUM",
      missingInputs:["allowable stress"],
      context:{knownInputs:{material:"AISI 1045"}}
    });
    expect(result.missingInputs).toEqual(["allowable stress"]);
    expect(result.contextUsed).toEqual(["material"]);
  });

  it("routes context resolution through the capability boundary",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog([{
      id:"ENGINEERING.RESOLVE_CONTEXT",domain:"orchestration",
      purpose:"resolve",inputs:["missingInputs","context"],outputs:["context_decision"],
      risk:"LOW",providers:["experience.context"],status:"PILOT"
    }]);
    registry.register(new EngineeringContextProvider());
    const router=new CapabilityRouter(registry);
    const result=await router.execute({
      capability:"ENGINEERING.RESOLVE_CONTEXT",risk:"LOW",
      input:{
        intent:"DESIGN",risk:"MEDIUM",consequence:"PROJECT_STATE",ambiguity:"LOW",
        missingInputs:["material","length"],
        context:{knownInputs:{material:"AISI 1045"}}
      }
    });
    expect(result.success).toBe(true);
    expect((result.output as {missingInputs:string[]}).missingInputs).toEqual(["length"]);
  });
});
