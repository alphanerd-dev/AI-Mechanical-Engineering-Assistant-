import {describe,expect,it} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {V2_0_21_CAPABILITIES} from "../src/capabilities/v2-0-21.js";
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";
import {ElectricalAnalysisProvider} from "../src/providers/electrical.js";
import {EngineeringVerificationProvider} from "../src/providers/engineering-verification.js";
import {EngineeringCompletionProvider} from "../src/providers/engineering-completion.js";
import {ElectricalEngineeringCompletionProvider} from "../src/providers/electrical-completion.js";
import {RiskAdaptiveExperienceProvider} from "../src/providers/experience.js";
import {EngineeringContextProvider} from "../src/providers/context.js";
import {AIEngineeringIntentProvider} from "../src/providers/ai-intent.js";
import {createDefaultDeterministicEngineeringIntentInterpreter} from "../src/intent/deterministic.js";
import {EngineeringCompletionUnitRegistry,createDefaultEngineeringCompletionUnitRegistry} from "../src/completion/registry.js";
import {ModelBackedEngineeringIntentAdapter,StaticModelIntentGenerator} from "../src/intent/model-adapter.js";
import {AuthenticatedIdentity} from "../src/auth/types.js";

const reviewer:AuthenticatedIdentity={
  subject:"electrical-reviewer",
  roles:["REVIEWER"],
  authenticatedAt:"2026-10-08T10:00:00.000Z"
};

function setup(){
  const registry=new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  registry.registerCatalog(V2_0_21_CAPABILITIES);
  const router=new CapabilityRouter(registry);

  registry.register(new NumericalAnalysisProvider());
  registry.register(new ElectricalAnalysisProvider());
  registry.register(new EngineeringVerificationProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new ElectricalEngineeringCompletionProvider(router));
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new AIEngineeringIntentProvider(
    router,
    createDefaultDeterministicEngineeringIntentInterpreter(),
    undefined,
    createDefaultEngineeringCompletionUnitRegistry()
  ));

  return router;
}

const completeIntent="Analyze a 24 V DC electrical load drawing 2 A. Maximum allowable power is 50 W.";

describe("V2.0.21 first non-mechanical completion unit — electrical DC load",()=>{
  it("executes deterministic DC power and resistance calculations",async()=>{
    const router=setup();

    const power=await router.execute({
      capability:"ANALYSIS.DC_POWER",
      risk:"LOW",
      input:{voltageV:24,currentA:2}
    });
    const resistance=await router.execute({
      capability:"ANALYSIS.DC_RESISTANCE",
      risk:"LOW",
      input:{voltageV:24,currentA:2}
    });

    expect(power.success).toBe(true);
    expect((power.output as any).powerW).toBe(48);
    expect(resistance.success).toBe(true);
    expect((resistance.output as any).resistanceOhm).toBe(12);
  });

  it("completes the electrical workflow with deterministic validation and evidence",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_DC_LOAD",
      risk:"HIGH",
      input:{projectId:"V2-0-21-COMPLETE",voltageV:24,currentA:2,maximumPowerW:50}
    });

    expect(result.success).toBe(true);
    const report=result.output as any;
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.completionUnit).toBe("ENGINEERING.COMPLETE_DC_LOAD");
    expect(report.validation.passed).toBe(true);
    expect(report.validation.calculatedPowerW).toBe(48);
    expect(report.validation.calculatedResistanceOhm).toBe(12);
    expect(report.decisionMetrics).toEqual([
      {key:"powerW",value:48,unit:"W"},
      {key:"resistanceOhm",value:12,unit:"Ω"},
      {key:"maximumPowerW",value:50,unit:"W"}
    ]);
    expect(report.evidence).toHaveLength(3);
    expect(report.evidence.every((item:any)=>item.status==="VERIFIED")).toBe(true);
    expect(report.lineage.evidenceIds).toHaveLength(3);
  });

  it("asks only for the first material electrical input",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"V2-0-21-MISSING",
        rawIntent:"Analyze a 24 V DC electrical load drawing 2 A."
      }
    });

    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.status).toBe("NEEDS_INPUT");
    expect(output.nextQuestion).toBe("maximum allowable power");
    expect(output.decision.metrics).toEqual([]);
    expect(output.decision.evidenceIds).toEqual([]);
  });

  it("fails closed when calculated power exceeds the explicit limit",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_DC_LOAD",
      risk:"HIGH",
      input:{projectId:"V2-0-21-FAIL",voltageV:24,currentA:2,maximumPowerW:30}
    });

    expect(result.success).toBe(false);
    const report=result.output as any;
    expect(report.status).toBe("FAILED");
    expect(report.validation.passed).toBe(false);
    expect(report.validation.powerWithinLimit).toBe(false);
    expect(report.lineage.evidenceIds).toHaveLength(0);
    expect(report.evidence).toHaveLength(0);
    expect(report.artifacts[0].validationStatus).toBe("FAIL");
  });

  it("closes only after authorized explicit approval and final verification",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_DC_LOAD",
      risk:"HIGH",
      input:{
        projectId:"V2-0-21-APPROVAL",
        voltageV:24,
        currentA:2,
        maximumPowerW:50,
        approval:{
          identity:reviewer,
          reason:"Reviewed the explicit DC load inputs and deterministic acceptance limit."
        }
      }
    });

    expect(result.success).toBe(true);
    const report=result.output as any;
    expect(report.status).toBe("COMPLETE");
    expect(report.project.status).toBe("COMPLETE");
    expect(report.project.stage).toBe("VERIFIED");
    expect(report.verification.status).toBe("PASS");
    expect(report.approvalGranted).toBe(true);
    expect(report.evidence.some((item:any)=>item.type==="HUMAN_REVIEW")).toBe(true);
    expect(report.lineage.evidenceIds).toHaveLength(4);
  });

  it("routes electrical natural language through the generic intent path",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{projectId:"V2-0-21-INTENT",rawIntent:completeIntent}
    });

    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.interpretation.goal).toBe("DC electrical load analysis");
    expect(output.interpretation.completionUnit).toBe("ENGINEERING.COMPLETE_DC_LOAD");
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.decision.validationPassed).toBe(true);
    expect(output.decision.metrics).toEqual([
      {key:"powerW",value:48,unit:"W"},
      {key:"resistanceOhm",value:12,unit:"Ω"},
      {key:"maximumPowerW",value:50,unit:"W"}
    ]);
    expect(output.decision.evidenceIds).toHaveLength(3);
  });

  it("reuses electrical context without invention",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{
        projectId:"V2-0-21-CONTEXT",
        rawIntent:"Verify the known DC electrical load against its explicit power limit.",
        context:{
          projectId:"V2-0-21-CONTEXT",
          knownInputs:{voltageV:24,currentA:2,maximumPowerW:50}
        }
      }
    });

    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.interpretation.contextUsed).toEqual(expect.arrayContaining([
      "voltageV","currentA","maximumPowerW"
    ]));
  });

  it("accepts model-backed electrical structure without making the model the authority",async()=>{
    const modelOutput={
      raw:completeIntent,
      goal:"DC electrical load analysis",
      domain:"electrical",
      completionUnit:"ENGINEERING.COMPLETE_DC_LOAD",
      inputs:[
        {name:"voltageV",value:24,unit:"V",source:"USER",sourceText:"24 V"},
        {name:"currentA",value:2,unit:"A",source:"USER",sourceText:"2 A"},
        {name:"maximumPowerW",value:50,unit:"W",source:"USER",sourceText:"maximum allowable power is 50 W"}
      ],
      missingInputs:[],
      requestedCapabilities:["ENGINEERING.COMPLETE_DC_LOAD"],
      confidence:"HIGH",
      ambiguity:"LOW",
      assumptions:[]
    };
    const interpreter=new ModelBackedEngineeringIntentAdapter(new StaticModelIntentGenerator(modelOutput));
    const registry=new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.registerCatalog(V2_0_21_CAPABILITIES);
    const router=new CapabilityRouter(registry);
    registry.register(new ElectricalAnalysisProvider());
    registry.register(new EngineeringVerificationProvider());
    registry.register(new ElectricalEngineeringCompletionProvider(router));
    registry.register(new RiskAdaptiveExperienceProvider());
    registry.register(new EngineeringContextProvider());
    registry.register(new AIEngineeringIntentProvider(
      router,
      interpreter,
      undefined,
      createDefaultEngineeringCompletionUnitRegistry()
    ));

    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{projectId:"V2-0-21-MODEL",rawIntent:completeIntent}
    });

    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.decision.metrics).toEqual([
      {key:"powerW",value:48,unit:"W"},
      {key:"resistanceOhm",value:12,unit:"Ω"},
      {key:"maximumPowerW",value:50,unit:"W"}
    ]);
    expect(output.decision.validationPassed).toBe(true);
  });

  it("does not force an unsupported pressure-vessel task into electrical",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.ENTER_FROM_INTENT",
      risk:"HIGH",
      input:{projectId:"V2-0-21-WRONG",rawIntent:"Size a pressure vessel for 10 bar."}
    });

    expect(result.success).toBe(true);
    const output=result.output as any;
    expect(output.status).toBe("NEEDS_INPUT");
    expect(output.interpretation.completionUnit).toBeUndefined();
    expect(output.decision.evidenceIds).toHaveLength(0);
  });
});
