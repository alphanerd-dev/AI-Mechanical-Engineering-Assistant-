import {describe,expect,it} from "vitest";
import {assessRiskAdaptiveExperience} from "../src/experience/risk-adaptive.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {RiskAdaptiveExperienceProvider} from "../src/providers/experience.js";

describe("V2.0.11 risk-adaptive engineering experience",()=>{
  it("is fast by default for safe exploration",()=>{
    const decision=assessRiskAdaptiveExperience({
      intent:"EXPLORE",
      risk:"LOW",
      consequence:"REVERSIBLE",
      ambiguity:"LOW"
    });
    expect(decision.level).toBe("FAST");
    expect(decision.executionPolicy).toBe("AUTO");
    expect(decision.evidenceRequired).toBe(false);
    expect(decision.approvalRequired).toBe(false);
  });

  it("automatically becomes rigorous for consequential engineering work",()=>{
    const decision=assessRiskAdaptiveExperience({
      intent:"DESIGN",
      risk:"MEDIUM",
      consequence:"PROJECT_STATE",
      ambiguity:"LOW"
    });
    expect(decision.level).toBe("RIGOROUS");
    expect(decision.executionPolicy).toBe("AUTO_WITH_VALIDATION");
    expect(decision.evidenceRequired).toBe(true);
  });

  it("asks only the first material missing input instead of forcing a mode choice",()=>{
    const decision=assessRiskAdaptiveExperience({
      intent:"DESIGN",
      risk:"HIGH",
      consequence:"PROJECT_STATE",
      ambiguity:"MEDIUM",
      missingInputs:["allowable stress","shaft length","material"]
    });
    expect(decision.level).toBe("EXPLICIT");
    expect(decision.executionPolicy).toBe("ASK_MINIMUM");
    expect(decision.nextQuestion).toBe("allowable stress");
  });

  it("does not let exploration override external consequence or critical risk",()=>{
    const external=assessRiskAdaptiveExperience({
      intent:"EXPLORE",
      risk:"LOW",
      consequence:"EXTERNAL_EFFECT",
      ambiguity:"LOW",
      requestedExperience:"EXPLORE"
    });
    expect(external.level).toBe("EXPLICIT");
    expect(external.executionPolicy).toBe("BLOCK");
    expect(external.approvalRequired).toBe(true);

    const critical=assessRiskAdaptiveExperience({
      intent:"EXPLORE",
      risk:"CRITICAL",
      consequence:"REVERSIBLE",
      ambiguity:"LOW",
      requestedExperience:"EXPLORE"
    });
    expect(critical.level).toBe("EXPLICIT");
    expect(critical.approvalRequired).toBe(true);
  });

  it("raises verification intent to explicit rigor",()=>{
    const decision=assessRiskAdaptiveExperience({
      intent:"ANALYZE",
      risk:"LOW",
      consequence:"REVERSIBLE",
      ambiguity:"LOW",
      requestedExperience:"VERIFY"
    });
    expect(decision.level).toBe("EXPLICIT");
    expect(decision.executionPolicy).toBe("BLOCK");
  });

  it("routes the decision through the capability provider boundary",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog([{
      id:"ENGINEERING.ASSESS_EXPERIENCE",
      domain:"orchestration",
      purpose:"Assess experience",
      inputs:[],
      outputs:["experience_decision"],
      risk:"LOW",
      providers:["experience.risk-adaptive"],
      status:"PILOT"
    }]);
    registry.register(new RiskAdaptiveExperienceProvider());
    const router=new CapabilityRouter(registry);
    const result=await router.execute({
      capability:"ENGINEERING.ASSESS_EXPERIENCE",
      risk:"LOW",
      input:{
        intent:"EXPLORE",
        risk:"LOW",
        consequence:"REVERSIBLE",
        ambiguity:"LOW"
      }
    });
    expect(result.success).toBe(true);
    expect((result.output as {level:string}).level).toBe("FAST");
  });
});
