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
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";

function router(){
  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_10_CAPABILITIES);
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  registry.registerCatalog(V2_0_12_CAPABILITIES);
  registry.registerCatalog(V2_0_14_CAPABILITIES);
  const router=new CapabilityRouter(registry);
  registry.register(new NumericalAnalysisProvider());
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new AIEngineeringIntentProvider(router,new DeterministicShaftIntentInterpreter()));
  return router;
}

describe("AI-native engineering intent entry",()=>{
  it("maps natural shaft intent into the existing completion unit",async()=>{
    const result=await router().execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"ai-intent-shaft-1",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. I am proposing 30 mm diameter."
      }
    });
    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.interpretation.extractedInputs).toMatchObject({
      projectId:"ai-intent-shaft-1",
      powerKw:5,
      speedRpm:1500,
      bendingMomentNm:80,
      allowableShearStressMpa:55,
      proposedDiameterMm:30
    });
    expect(output.experience.level).toBe("RIGOROUS");
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.completion.validation.passed).toBe(true);
    expect(output.completion.evidence).toHaveLength(3);
    expect(output.decision).toMatchObject({
      status:"WAITING_APPROVAL",
      validationPassed:true
    });
    expect(output.decision.metrics).toEqual(expect.arrayContaining([
      {key:"minimumDiameterMm",value:expect.any(Number),unit:"mm"},
      {key:"proposedDiameterMm",value:30,unit:"mm"}
    ]));
    expect(output.decision.evidenceIds).toHaveLength(3);
    expect(output.decision.metrics).toEqual(expect.arrayContaining([{key:"torqueNm",value:expect.closeTo(31.8333333333,10),unit:"N·m"}]));
  });

  it("uses known context instead of asking for values already available",async()=>{
    const result=await router().execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"ai-intent-context-1",
        rawIntent:"Design the shaft using the known project inputs.",
        context:{
          projectId:"ai-intent-context-1",
          knownInputs:{
            powerKw:5,
            speedRpm:1500,
            bendingMomentNm:80,
            allowableShearStressMpa:55,
            proposedDiameterMm:30
          }
        }
      }
    });
    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.interpretation.contextUsed).toEqual(expect.arrayContaining([
      "powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa","proposedDiameterMm"
    ]));
  });

  it("asks for the first material input rather than inventing it",async()=>{
    const result=await router().execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"ai-intent-missing-1",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm with a 30 mm diameter."
      }
    });
    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.status).toBe("NEEDS_INPUT");
    expect(output.nextQuestion).toBe("bending moment");
    expect(output.completion).toBeUndefined();
  });

  it("does not bypass deterministic validation",async()=>{
    const result=await router().execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"ai-intent-fail-1",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. I am proposing 10 mm diameter."
      }
    });
    expect(result.success).toBe(false);
    const output=result.output as any;
    expect(output.status).toBe("FAILED");
    expect(output.completion.evidence).toHaveLength(0);
  });
});
