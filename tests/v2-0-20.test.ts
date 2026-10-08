import {describe,expect,it} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {V2_0_10_CAPABILITIES} from "../src/capabilities/v2-0-10.js";
import {V2_0_11_CAPABILITIES} from "../src/capabilities/v2-0-11.js";
import {V2_0_12_CAPABILITIES} from "../src/capabilities/v2-0-12.js";
import {V2_0_14_CAPABILITIES} from "../src/capabilities/v2-0-14.js";
import {EngineeringCompletionProvider} from "../src/providers/engineering-completion.js";
import {RiskAdaptiveExperienceProvider} from "../src/providers/experience.js";
import {EngineeringContextProvider} from "../src/providers/context.js";
import {AIEngineeringIntentProvider} from "../src/providers/ai-intent.js";
import {DeterministicShaftIntentInterpreter} from "../src/intent/shaft.js";
import {EngineeringCompletionUnitRegistry,createDefaultEngineeringCompletionUnitRegistry} from "../src/completion/registry.js";
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";

describe("V2.0.20 domain-neutral completion routing",()=>{
  it("registers the canonical shaft completion unit without exposing shaft logic in the registry",()=>{
    const registry=createDefaultEngineeringCompletionUnitRegistry();
    const unit=registry.resolve("ENGINEERING.COMPLETE_SHAFT");
    expect(unit).toBeDefined();
    expect(unit?.capability).toBe("ENGINEERING.COMPLETE_SHAFT");
    expect(unit?.requiredInputs.map(item=>item.label)).toEqual([
      "power","speed","bending moment","allowable shear stress","proposed shaft diameter"
    ]);
  });

  it("rejects duplicate completion-unit registration",()=>{
    const registry=new EngineeringCompletionUnitRegistry();
    const unit=createDefaultEngineeringCompletionUnitRegistry().resolve("ENGINEERING.COMPLETE_SHAFT")!;
    registry.register(unit);
    expect(()=>registry.register(unit)).toThrow("Completion unit already registered");
  });

  it("routes the selected completion unit through the existing capability router",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(V2_0_10_CAPABILITIES);
    registry.registerCatalog(V2_0_11_CAPABILITIES);
    registry.registerCatalog(V2_0_12_CAPABILITIES);
    registry.registerCatalog(V2_0_14_CAPABILITIES);
    const router=new CapabilityRouter(registry);
    registry.register(new NumericalAnalysisProvider());
    registry.register(new EngineeringCompletionProvider(router));
    registry.register(new RiskAdaptiveExperienceProvider());
    registry.register(new EngineeringContextProvider());
    registry.register(new AIEngineeringIntentProvider(
      router,
      new DeterministicShaftIntentInterpreter(),
      undefined,
      createDefaultEngineeringCompletionUnitRegistry()
    ));

    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"V2-0-20-ROUTING",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm."
      }
    });

    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.completion.completionUnit).toBe("ENGINEERING.COMPLETE_SHAFT");
    expect(output.completion.decisionMetrics).toHaveLength(3);
    expect(output.decision.metrics).toEqual(output.completion.decisionMetrics);
  });

  it("fails closed when the selected completion unit adapter throws",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(V2_0_10_CAPABILITIES);
    registry.registerCatalog(V2_0_11_CAPABILITIES);
    registry.registerCatalog(V2_0_12_CAPABILITIES);
    registry.registerCatalog(V2_0_14_CAPABILITIES);
    const router=new CapabilityRouter(registry);
    registry.register(new RiskAdaptiveExperienceProvider());
    registry.register(new EngineeringContextProvider());

    const units=new EngineeringCompletionUnitRegistry();
    units.register({
      id:"ENGINEERING.COMPLETE_TEST",
      capability:"ENGINEERING.COMPLETE_TEST",
      requiredInputs:[],
      execute:async()=>{throw new Error("adapter unavailable");}
    });

    const interpreter={
      async interpret(){
        return {
          raw:"test",
          goal:"test",
          completionUnit:"ENGINEERING.COMPLETE_TEST",
          extractedInputs:{projectId:"V2-0-20-FAIL"},
          missingInputs:[],
          confidence:"HIGH" as const,
          ambiguity:"LOW" as const,
          contextUsed:[],
          assumptions:[]
        };
      }
    };

    registry.register(new AIEngineeringIntentProvider(router,interpreter,undefined,units));

    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{projectId:"V2-0-20-FAIL",rawIntent:"test"}
    });

    expect(result.success).toBe(false);
    expect((result.output as any).decision).toMatchObject({
      status:"FAILED",
      validationPassed:false,
      metrics:[],
      evidenceIds:[]
    });
  });
});
