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
    {id:"ANALYSIS.SHAFT_TORQUE",domain:"analysis",purpose:"torque",inputs:["powerKw","speedRpm"],outputs:["torqueNm"],risk:"LOW",providers:["numerical-analysis"],status:"VERIFIED"},
    {id:"ANALYSIS.SHAFT_SIZE",domain:"analysis",purpose:"size",inputs:["powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa"],outputs:["minimumDiameterMm"],risk:"MEDIUM",providers:["numerical-analysis"],status:"PILOT"},
    {id:"ENGINEERING.VERIFY_PROJECT",domain:"validation",purpose:"verify",inputs:["project","evidence","artifacts"],outputs:["verification"],risk:"HIGH",providers:["engineering-core"],status:"EXPERIMENTAL"},
    {id:"ENGINEERING.COMPLETE_SHAFT",domain:"orchestration",purpose:"complete",inputs:[],outputs:["report"],risk:"HIGH",providers:["engineering-completion"],status:"PILOT"}
  ]);
  registry.register(new NumericalAnalysisProvider());
  registry.register(new EngineeringVerificationProvider());
  const router=new CapabilityRouter(registry);
  registry.register(new EngineeringCompletionProvider(router));
  return router;
}
const reviewer:AuthenticatedIdentity={subject:"reviewer-1",roles:["REVIEWER"],authenticatedAt:"2026-10-07T22:00:00.000Z"};
function input(projectId:string){return {projectId,powerKw:5,speedRpm:1500,bendingMomentNm:50,allowableShearStressMpa:40,proposedDiameterMm:25};}

describe("V2.0 final Engineering Completion Unit gate",()=>{
  it("passes the complete workflow without hidden human steps",async()=>{
    const result=await setup().execute({capability:"ENGINEERING.COMPLETE_SHAFT",risk:"HIGH",input:input("P-FINAL-1")});
    expect(result.success).toBe(true);
    const report=result.output as any;
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.taskGraph.tasks.every((task:any)=>task.status==="COMPLETED")).toBe(true);
    expect(report.validation.passed).toBe(true);
    expect(report.evidence).toHaveLength(3);
    expect(report.evidence.every((e:any)=>e.status==="VERIFIED")).toBe(true);
    expect(report.artifacts).toHaveLength(1);
    expect(report.artifacts[0].validationStatus).toBe("PASS");
    expect(report.artifacts[0].evidenceIds).toEqual(report.evidence.map((e:any)=>e.id));
    expect(report.project.evidenceIds).toEqual(report.evidence.map((e:any)=>e.id));
    expect(report.project.events.some((e:any)=>e.action==="ENGINEERING_EVIDENCE_AUTO_GENERATED")).toBe(true);
    expect(report.lineage.artifactIds).toEqual([report.artifacts[0].id]);
    expect(report.lineage.evidenceIds).toEqual(report.evidence.map((e:any)=>e.id));
  });

  it("closes only with authorized approval and final verification",async()=>{
    const result=await setup().execute({capability:"ENGINEERING.COMPLETE_SHAFT",risk:"HIGH",input:{...input("P-FINAL-2"),approval:{identity:reviewer,reason:"Reviewed deterministic inputs, validation and evidence."}}});
    const report=result.output as any;
    expect(result.success).toBe(true);
    expect(report.status).toBe("COMPLETE");
    expect(report.project.status).toBe("COMPLETE");
    expect(report.project.stage).toBe("VERIFIED");
    expect(report.verification.status).toBe("PASS");
    expect(report.approvalGranted).toBe(true);
    expect(report.evidence.filter((e:any)=>e.type==="HUMAN_REVIEW")).toHaveLength(1);
    expect(report.lineage.artifactIds).toEqual([report.artifacts[0].id]);
    expect(report.lineage.evidenceIds).toEqual(report.evidence.map((e:any)=>e.id));
  });

  it("stops before evidence when deterministic validation fails",async()=>{
    const result=await setup().execute({capability:"ENGINEERING.COMPLETE_SHAFT",risk:"HIGH",input:{...input("P-FINAL-3"),bendingMomentNm:300,proposedDiameterMm:10}});
    const report=result.output as any;
    expect(result.success).toBe(false);
    expect(report.status).toBe("FAILED");
    expect(report.evidence).toHaveLength(0);
    expect(report.lineage.evidenceIds).toHaveLength(0);
    expect(report.artifacts[0].evidenceIds).toHaveLength(0);
  });
});
