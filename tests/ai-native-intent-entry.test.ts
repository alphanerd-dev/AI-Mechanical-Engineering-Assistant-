import {describe,expect,it} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {V2_0_10_CAPABILITIES} from "../src/capabilities/v2-0-10.js";
import {V2_0_11_CAPABILITIES} from "../src/capabilities/v2-0-11.js";
import {V2_0_12_CAPABILITIES} from "../src/capabilities/v2-0-12.js";
import {V2_0_14_CAPABILITIES} from "../src/capabilities/v2-0-14.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {EngineeringCompletionProvider} from "../src/providers/engineering-completion.js";
import {RiskAdaptiveExperienceProvider} from "../src/providers/experience.js";
import {EngineeringContextProvider} from "../src/providers/context.js";
import {AIEngineeringIntentProvider} from "../src/providers/ai-intent.js";
import {DeterministicShaftIntentInterpreter} from "../src/intent/shaft.js";
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";

type IntentTestOutput = {
  status: string;
  nextQuestion?: string;
  decisionSummary?: string;
  interpretation: {
    extractedInputs: Record<string, unknown>;
    contextUsed: string[];
  };
  completion?: {
    validation?: { passed: boolean } | null;
    evidence?: unknown[];
    artifacts?: Array<{ informationStatus: string; validationStatus: string }>;
    nextAction?: string;
  };
  decision: {
    metrics: Array<{ key: string; value: number | string; unit: string }>;
  };
};

function router(){
  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_10_CAPABILITIES);
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  registry.registerCatalog(V2_0_12_CAPABILITIES);
  registry.registerCatalog(V2_0_14_CAPABILITIES);
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  const router=new CapabilityRouter(registry);
  registry.register(new NumericalAnalysisProvider());
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new AIEngineeringIntentProvider(router,new DeterministicShaftIntentInterpreter()));
  return router;
}

describe("AI-native engineering intent entry",()=>{
  it("derives the gear bending moment from shaft geometry instead of requesting it",async()=>{
    const result=await router().execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"ai-intent-shaft-geometry",
        rawIntent:"Design a solid circular shaft to transmit 12 kW at 1450 rpm. The shaft is simply supported between two bearings 400 mm apart, with a spur gear mounted at midpoint. The gear has a pitch diameter of 180 mm and pressure angle of 20 degrees. Assume AISI 1020 steel (Sut = 420 MPa, Sy = 350 MPa). Use a design factor of 2.5 based on yield strength. Neglect axial forces and shock/impact factors for now. Apply the ASME elliptic criteria."
      }
    });
    expect(result.success).toBe(false);
    const output=result.output as unknown as IntentTestOutput;
    expect(output.interpretation.extractedInputs).toMatchObject({
      projectId:"ai-intent-shaft-geometry",
      powerKw:12,
      speedRpm:1450,
      bearingSpanMm:400,
      gearPositionFromLeftMm:200,
      pitchDiameterMm:180,
      pressureAngleDeg:20,
      materialGrade:"AISI 1020",
      ultimateTensileStrengthMpa:420,
      yieldStrengthMpa:350,
      designFactor:2.5,
      axialLoadN:0
    });
    expect(output.interpretation.extractedInputs).not.toHaveProperty("bendingMomentNm");
    expect(output.status).toBe("FAILED");
    const completion = output.completion!;
    expect(completion.validation?.passed).toBe(false);
    expect(completion.evidence).toHaveLength(0);
    expect(completion.artifacts?.[0]?.informationStatus).toBe("CALCULATED");
    expect(completion.artifacts?.[0]?.validationStatus).toBe("UNVALIDATED");
    expect(output.decision.metrics).toEqual(expect.arrayContaining([
      {key:"torqueNm",value:expect.any(Number),unit:"N·m"},
      {key:"maximumBendingMomentNm",value:expect.any(Number),unit:"N·m"},
      {key:"minimumDiameterMm",value:expect.any(Number),unit:"mm"},
      {key:"achievedYieldFactorOfSafety",value:expect.any(Number),unit:"—"}
    ]));
    expect(completion.nextAction).toContain("ASME elliptic criterion was not evaluated");
  });
  it("uses known geometry and material context instead of asking for values already available",async()=>{
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
            bearingSpanMm:400,
            gearPositionFromLeftMm:200,
            pitchDiameterMm:180,
            pressureAngleDeg:20,
            materialGrade:"AISI 1020",
            yieldStrengthMpa:350,
            ultimateTensileStrengthMpa:420,
            designFactor:2.5,
            axialLoadN:0
          }
        }
      }
    });
    expect(result.success).toBe(true);
    const output=result.output as unknown as IntentTestOutput;
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.decisionSummary).toContain("not independently verified");
    expect(output.completion?.evidence).toHaveLength(0);
    expect(output.interpretation.contextUsed).toEqual(expect.arrayContaining([
      "powerKw","speedRpm","bearingSpanMm","gearPositionFromLeftMm","pitchDiameterMm",
      "pressureAngleDeg","materialGrade","yieldStrengthMpa","ultimateTensileStrengthMpa","designFactor"
    ]));
  });
  it("asks for the first missing geometry input rather than inventing it",async()=>{
    const result=await router().execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"ai-intent-missing-1",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm and check a candidate diameter of 10 mm."
      }
    });
    expect(result.success).toBe(true);
    const output=result.output as unknown as IntentTestOutput;
    expect(output.status).toBe("NEEDS_INPUT");
    expect(output.nextQuestion).toBe("bearing span");
    expect(output.completion).toBeUndefined();
  });

  it("does not bypass deterministic validation",async()=>{
    const result=await router().execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"ai-intent-fail-1",
        rawIntent:"Design a shaft that transmits 5 kW at 1500 rpm. The shaft is simply supported between bearings 400 mm apart. A gear at midpoint has pitch diameter 180 mm and pressure angle 20 degrees. Material AISI 1020, Sy 350 MPa and Sut 420 MPa. Design factor 2.5. Candidate diameter 10 mm."
      }
    });
    expect(result.success).toBe(false);
    const output=result.output as unknown as IntentTestOutput;
    expect(output.status).toBe("FAILED");
    expect(output.completion?.evidence).toHaveLength(0);
  });
});
