import {describe,expect,it} from "vitest";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";
import {RequirementTraceability} from "../src/requirements/traceability.js";
import {verifyProjectRequirements} from "../src/requirements/project-verification.js";
import {EvidenceRecord} from "../src/artifacts/engineering-artifacts.js";

function setup(){
  const project=createProject("Verification project");
  project.requirements.push(
    {id:"REQ-1",name:"Strength",priority:"MUST",status:"OPEN"},
    {id:"REQ-2",name:"Mass",priority:"SHOULD",status:"OPEN"}
  );
  const traceability=new RequirementTraceability();
  traceability.addRequirement({id:"REQ-1",name:"Strength",statement:"The part shall withstand load.",kind:"ENGINEERING",priority:"MUST",status:"OPEN"});
  traceability.addRequirement({id:"REQ-2",name:"Mass",statement:"The part shall meet mass target.",kind:"ENGINEERING",priority:"SHOULD",status:"OPEN"});
  return {project,traceability,memory:new EngineeringMemory()};
}

describe("project verification",()=>{
  it("is INCOMPLETE when a requirement has no verified evidence",()=>{
    const {project,traceability,memory}=setup();
    memory.save(project);
    expect(verifyProjectRequirements(project,memory,traceability).status).toBe("INCOMPLETE");
  });

  it("passes only when every requirement has verified linked evidence",()=>{
    const {project,traceability,memory}=setup();
    const evidence={
      id:"e-strength",type:"SIMULATION" as const,claim:"Strength requirement passed.",
      status:"VERIFIED" as const,requirementIds:["REQ-1"],timestamp:new Date().toISOString()
    };
    memory.save(project);
    memory.saveEvidence(project.id,evidence);
    memory.linkEvidence(project.id,"REQ-1",evidence.id);
    let report=verifyProjectRequirements(project,memory,traceability);
    expect(report.status).toBe("INCOMPLETE");
    expect(report.verifiedCount).toBe(1);

    const massEvidence={
      id:"e-mass",type:"CALCULATION" as const,claim:"Mass requirement passed.",
      status:"VERIFIED" as const,requirementIds:["REQ-2"],timestamp:new Date().toISOString()
    };
    memory.saveEvidence(project.id,massEvidence);
    memory.linkEvidence(project.id,"REQ-2",massEvidence.id);
    report=verifyProjectRequirements(project,memory,traceability);
    expect(report.status).toBe("PASS");
  });

  it("fails when a requirement is explicitly blocked",()=>{
    const {project,traceability,memory}=setup();
    project.requirements[0].status="BLOCKED";
    memory.save(project);
    expect(verifyProjectRequirements(project,memory,traceability).status).toBe("FAIL");
  });
});

describe("EngineeringVerificationEngine",()=>{
  it("passes only on explicitly attributed verified evidence",async()=>{
    const {EngineeringVerificationEngine}=await import("../src/requirements/project-verification.js");
    const engine=new EngineeringVerificationEngine();
    const result=await engine.verify({
      requirementId:"REQ-1",
      evidence:[
        {id:"unrelated",type:"SIMULATION",claim:"Verified",status:"VERIFIED",requirementIds:["REQ-2"],timestamp:new Date().toISOString()},
        {id:"related",type:"SIMULATION",claim:"Verified",status:"VERIFIED",requirementIds:["REQ-1"],timestamp:new Date().toISOString()}
      ]
    });
    expect(result.status).toBe("PASS");
    expect(result.verifiedEvidenceIds).toEqual(["related"]);
  });

  it("does not treat calculated evidence as verified",async()=>{
    const {EngineeringVerificationEngine}=await import("../src/requirements/project-verification.js");
    const result=await new EngineeringVerificationEngine().verify({
      requirementId:"REQ-1",
      evidence:[{id:"calc",type:"CALCULATION",claim:"Calculated",status:"CALCULATED",requirementIds:["REQ-1"],timestamp:new Date().toISOString()}]
    });
    expect(result.status).toBe("INCOMPLETE");
  });

  it("supports explicit evidence-count gates",async()=>{
    const {EngineeringVerificationEngine}=await import("../src/requirements/project-verification.js");
    const evidence=Array.from({length:2},(_,i)=>({
      id:"e"+i,type:"HUMAN_REVIEW" as const,claim:"Verified",status:"VERIFIED" as const,
      requirementIds:["REQ-1"],timestamp:new Date().toISOString()
    }));
    const engine=new EngineeringVerificationEngine();
    expect((await engine.verify({requirementId:"REQ-1",evidence,minimumEvidence:2})).status).toBe("PASS");
    expect((await engine.verify({requirementId:"REQ-1",evidence:evidence.slice(0,1),minimumEvidence:2})).status).toBe("INCOMPLETE");
  });

  it("requires dedicated manufacturing check evidence for manufacturing gates",async()=>{
    const {EngineeringVerificationEngine}=await import("../src/requirements/project-verification.js");
    const engine=new EngineeringVerificationEngine();
    const humanReview:EvidenceRecord={
      id:"review-1",type:"HUMAN_REVIEW",claim:"Engineer reviewed the part",
      status:"VERIFIED",requirementIds:["REQ-1"],timestamp:new Date().toISOString()
    };
    const incomplete=await engine.verify({
      requirementId:"REQ-1",evidence:[humanReview],
      gates:[{type:"MANUFACTURING",minimum:1}]
    });
    expect(incomplete.status).toBe("INCOMPLETE");

    const manufacturingCheck:EvidenceRecord={
      id:"mfg-1",type:"MANUFACTURING_CHECK",claim:"Dimensional inspection passed",
      status:"VERIFIED",method:"CMM inspection",requirementIds:["REQ-1"],timestamp:new Date().toISOString()
    };
    const passed=await engine.verify({
      requirementId:"REQ-1",evidence:[humanReview,manufacturingCheck],
      gates:[{type:"MANUFACTURING",minimum:1}]
    });
    expect(passed.status).toBe("PASS");
    expect(passed.satisfiedGates).toHaveLength(1);
  });
});

describe("multi-domain verification gates",()=>{
  it("requires every requested evidence domain",async()=>{
    const {EngineeringVerificationEngine}=await import("../src/requirements/project-verification.js");
    const engine=new EngineeringVerificationEngine();
    const evidence: EvidenceRecord[] = [
      {id:"cad",type:"GEOMETRY_CHECK",claim:"CAD passed",status:"VERIFIED",requirementIds:["REQ-1"],timestamp:new Date().toISOString()},
      {id:"fea",type:"SIMULATION" as const,claim:"FEA passed",status:"VERIFIED" as const,requirementIds:["REQ-1"],timestamp:new Date().toISOString()}
    ];
    let result=await engine.verify({requirementId:"REQ-1",evidence,gates:[
      {type:"CAD",minimum:1},{type:"FEA",minimum:1},{type:"CALCULATION",minimum:1}
    ]});
    expect(result.status).toBe("INCOMPLETE");
    expect(result.unmetGates).toHaveLength(1);

    evidence.push({id:"calc",type:"CALCULATION",claim:"Calculation passed",status:"VERIFIED" as const,requirementIds:["REQ-1"],timestamp:new Date().toISOString()});
    result=await engine.verify({requirementId:"REQ-1",evidence,gates:[
      {type:"CAD",minimum:1},{type:"FEA",minimum:1},{type:"CALCULATION",minimum:1}
    ]});
    expect(result.status).toBe("PASS");
    expect(result.unmetGates).toHaveLength(0);
  });
});

describe("verification plans",()=>{
  it("executes a reusable multi-domain verification plan",async()=>{
    const {executeVerificationPlan}=await import("../src/requirements/project-verification.js");
    const now=new Date().toISOString();
    const evidence=[
      {id:"cad",type:"GEOMETRY_CHECK" as const,claim:"CAD passed",status:"VERIFIED" as const,requirementIds:["REQ-1"],timestamp:now},
      {id:"fea",type:"SIMULATION" as const,claim:"FEA passed",status:"VERIFIED" as const,requirementIds:["REQ-1"],timestamp:now},
      {id:"calc",type:"CALCULATION" as const,claim:"Calculation passed",status:"VERIFIED" as const,requirementIds:["REQ-1"],timestamp:now}
    ];
    const result=await executeVerificationPlan({
      id:"VP-1",requirementId:"REQ-1",
      gates:[{type:"CAD",minimum:1},{type:"FEA",minimum:1},{type:"CALCULATION",minimum:1}],
      minimumTotalEvidence:3,approvalRequired:true
    },evidence);
    expect(result.status).toBe("PASS");
    expect(result.planId).toBe("VP-1");
    expect(result.approvalRequired).toBe(true);
  });
});
