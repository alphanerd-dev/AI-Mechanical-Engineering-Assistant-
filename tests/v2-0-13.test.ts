import {describe,expect,it} from "vitest";
import {produceEvidenceByProduct} from "../src/evidence/by-product.js";
import {EngineeringArtifact} from "../src/artifacts/engineering-artifacts.js";
import {ProjectState} from "../src/core/types.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";
import {EngineeringVerificationProvider} from "../src/providers/engineering-verification.js";
import {EngineeringCompletionProvider} from "../src/providers/engineering-completion.js";

function project():ProjectState{
  return {
    id:"P-13",
    name:"Evidence by-product test",
    stage:"ENGINEERING_COMPLETION",
    status:"ACTIVE",
    requirements:[
      {id:"REQ-1",name:"Torque",priority:"MUST",status:"OPEN"},
      {id:"REQ-2",name:"Diameter",priority:"MUST",status:"OPEN"}
    ],
    assumptions:[],
    openQuestions:[],
    unresolvedRisks:[],
    events:[]
  };
}

function artifact():EngineeringArtifact{
  return {
    id:"ART-13",
    kind:"CALCULATION_RESULT",
    name:"Validated calculation",
    backend:"test",
    validationStatus:"PASS",
    informationStatus:"CALCULATED",
    evidenceIds:[],
    requirementIds:["REQ-1","REQ-2"],
    createdAt:"2026-10-08T00:00:00.000Z"
  };
}

describe("V2.0.13 evidence-as-a-by-product",()=>{
  it("emits verified evidence automatically from a passing deterministic gate",()=>{
    const result=produceEvidenceByProduct({
      project:project(),
      artifacts:[artifact()],
      validation:"PASS",
      drafts:[
        {
          id:"EVD-13",
          type:"CALCULATION",
          claim:"Torque calculation passed deterministic validation.",
          method:"T = 9550 P / n",
          value:{torqueNm:31.83},
          artifactIds:["ART-13"],
          requirementIds:["REQ-1"]
        },
        {
          id:"EVD-13-2",
          type:"CALCULATION",
          claim:"Diameter acceptance passed deterministic validation.",
          method:"minimumDiameterMm <= proposedDiameterMm",
          value:{minimumDiameterMm:20,proposedDiameterMm:25},
          artifactIds:["ART-13"],
          requirementIds:["REQ-2"]
        }
      ],
      timestamp:"2026-10-08T00:00:00.000Z"
    });

    expect(result.emitted).toBe(true);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.every(item=>item.status==="VERIFIED")).toBe(true);
    expect(result.artifacts[0].evidenceIds).toEqual(["EVD-13","EVD-13-2"]);
    expect(result.reason).toContain("automatically");
  });

  it("does not emit evidence when validation is failed or incomplete",()=>{
    const failed=produceEvidenceByProduct({
      project:project(),
      artifacts:[artifact()],
      validation:"FAIL",
      drafts:[{
        id:"EVD-FAIL",
        type:"CALCULATION",
        claim:"Should not be verified.",
        artifactIds:["ART-13"],
        requirementIds:["REQ-1"]
      }]
    });

    expect(failed.emitted).toBe(false);
    expect(failed.evidence).toHaveLength(0);

    const incomplete=produceEvidenceByProduct({
      project:project(),
      artifacts:[artifact()],
      validation:"UNVALIDATED",
      drafts:[{
        id:"EVD-INCOMPLETE",
        type:"CALCULATION",
        claim:"Should not be verified.",
        artifactIds:["ART-13"],
        requirementIds:["REQ-1"]
      }]
    });

    expect(incomplete.emitted).toBe(false);
    expect(incomplete.evidence).toHaveLength(0);
  });

  it("fails closed on cross-project provenance",()=>{
    const result=produceEvidenceByProduct({
      project:project(),
      artifacts:[artifact()],
      validation:"PASS",
      drafts:[{
        id:"EVD-BAD-REQ",
        type:"CALCULATION",
        claim:"Invalid provenance.",
        artifactIds:["ART-13"],
        requirementIds:["REQ-OUTSIDE"]
      }]
    });
    expect(result.emitted).toBe(false);
    expect(result.evidence).toHaveLength(0);
  });

  it("is integrated into the end-to-end shaft completion without an explicit evidence request",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog([
      {
        id:"ANALYSIS.SHAFT_TORQUE",domain:"analysis",purpose:"torque",
        inputs:["powerKw","speedRpm"],outputs:["torqueNm"],risk:"LOW",
        providers:["numerical-analysis"],status:"VERIFIED"
      },
      {
        id:"ANALYSIS.SHAFT_SIZE",domain:"analysis",purpose:"size",
        inputs:["powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa"],
        outputs:["minimumDiameterMm"],risk:"MEDIUM",
        providers:["numerical-analysis"],status:"PILOT"
      },
      {
        id:"ENGINEERING.VERIFY_PROJECT",domain:"validation",purpose:"verify",
        inputs:["project","evidence","artifacts"],outputs:["verification"],
        risk:"HIGH",providers:["engineering-core"],status:"EXPERIMENTAL"
      },
      {
        id:"ENGINEERING.COMPLETE_SHAFT",domain:"orchestration",purpose:"complete",
        inputs:[],outputs:["report"],risk:"HIGH",
        providers:["engineering-completion"],status:"PILOT"
      }
    ]);
    registry.register(new NumericalAnalysisProvider());
    registry.register(new EngineeringVerificationProvider());
    const router=new CapabilityRouter(registry);
    registry.register(new EngineeringCompletionProvider(router));

    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_SHAFT",
      risk:"HIGH",
      input:{
        projectId:"P-13-E2E",
        powerKw:5,
        speedRpm:1500,
        bendingMomentNm:50,
        allowableShearStressMpa:40,
        proposedDiameterMm:25
      }
    });

    expect(result.success).toBe(true);
    const report=result.output as any;
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.evidence).toHaveLength(3);
    expect(report.evidence.every((item:any)=>item.status==="VERIFIED")).toBe(true);
    expect(report.artifacts[0].evidenceIds).toEqual([
      "EVD-P-13-E2E-TORQUE",
      "EVD-P-13-E2E-SIZING",
      "EVD-P-13-E2E-ACCEPTANCE"
    ]);
  });
});
