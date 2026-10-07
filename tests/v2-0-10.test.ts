import {describe,expect,it} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {NumericalAnalysisProvider} from "../src/providers/numerical.js";
import {EngineeringVerificationProvider} from "../src/providers/engineering-verification.js";
import {EngineeringCompletionProvider} from "../src/providers/engineering-completion.js";
import {AuthenticatedIdentity} from "../src/auth/types.js";

function setup(){
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
  return router;
}

const reviewer:AuthenticatedIdentity={
  subject:"reviewer-1",
  roles:["REVIEWER"],
  authenticatedAt:"2026-10-07T22:00:00.000Z"
};

function completeInput(projectId:string){
  return {
    projectId,
    powerKw:5,
    speedRpm:1500,
    bendingMomentNm:50,
    allowableShearStressMpa:40,
    proposedDiameterMm:25
  };
}

describe("V2.0.10 engineering completion unit",()=>{
  it("blocks before execution when critical inputs are missing",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_SHAFT",
      risk:"HIGH",
      input:{projectId:"P-10",powerKw:5,speedRpm:1500}
    });
    expect(result.success).toBe(true);
    const report=result.output as {status:string;missingInputs:string[]};
    expect(report.status).toBe("BLOCKED");
    expect(report.missingInputs).toContain("bending moment");
    expect(report.missingInputs).toContain("allowable shear stress");
    expect(report.missingInputs).toContain("proposed shaft diameter");
  });

  it("completes deterministic execution and produces evidence before approval",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_SHAFT",
      risk:"HIGH",
      input:completeInput("P-10A")
    });
    expect(result.success).toBe(true);
    const report=result.output as any;
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.taskGraph.tasks.every((task:any)=>task.status==="COMPLETED")).toBe(true);
    expect(report.validation.passed).toBe(true);
    expect(report.validation.minimumDiameterMm).toBeLessThanOrEqual(25);
    expect(report.evidence).toHaveLength(3);
    expect(report.evidence.every((item:any)=>item.status==="VERIFIED")).toBe(true);
    expect(report.artifacts[0].kind).toBe("CALCULATION_RESULT");
    expect(report.artifacts[0].validationStatus).toBe("PASS");
    expect(report.project.status).toBe("ACTIVE");
  });

  it("closes only after authorized explicit approval and final verification",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_SHAFT",
      risk:"HIGH",
      input:{
        ...completeInput("P-10B"),
        approval:{
          identity:reviewer,
          reason:"Reviewed calculation inputs and deterministic acceptance criteria."
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
    expect(report.project.requirements.every((item:any)=>item.status==="SATISFIED")).toBe(true);
    expect(report.artifacts[0].informationStatus).toBe("VERIFIED");
    expect(report.project.events.some((event:any)=>event.action==="ENGINEERING_COMPLETION_APPROVED")).toBe(true);
    expect(report.lineage.requirementIds).toHaveLength(5);
    expect(report.lineage.artifactIds).toHaveLength(1);
    expect(report.lineage.evidenceIds).toHaveLength(4);
  });

  it("does not allow an engineer role to grant the final approval",async()=>{
    const router=setup();
    const engineer:AuthenticatedIdentity={
      subject:"engineer-1",
      roles:["ENGINEER"],
      authenticatedAt:"2026-10-07T22:00:00.000Z"
    };
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_SHAFT",
      risk:"HIGH",
      input:{
        ...completeInput("P-10C"),
        approval:{identity:engineer,reason:"I approve this."}
      }
    });
    expect(result.success).toBe(true);
    const report=result.output as any;
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.approvalGranted).toBe(false);
    expect(report.evidence.some((item:any)=>item.type==="HUMAN_REVIEW")).toBe(false);
  });

  it("fails closed when the proposed diameter does not meet the deterministic minimum",async()=>{
    const router=setup();
    const result=await router.execute({
      capability:"ENGINEERING.COMPLETE_SHAFT",
      risk:"HIGH",
      input:{
        projectId:"P-10D",
        powerKw:5,
        speedRpm:1500,
        bendingMomentNm:300,
        allowableShearStressMpa:40,
        proposedDiameterMm:10
      }
    });
    expect(result.success).toBe(false);
    const report=result.output as any;
    expect(report.status).toBe("FAILED");
    expect(report.validation.passed).toBe(false);
    expect(report.lineage.evidenceIds).toHaveLength(0);
    expect(report.nextAction).toContain("fail-closed");
  });
});
