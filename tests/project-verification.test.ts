import {describe,expect,it} from "vitest";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";
import {RequirementTraceability} from "../src/requirements/traceability.js";
import {verifyProjectRequirements} from "../src/requirements/project-verification.js";

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
});
