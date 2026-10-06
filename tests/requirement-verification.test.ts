import {describe,expect,it} from "vitest";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";
import {RequirementTraceability} from "../src/requirements/traceability.js";
import {verifyRequirementWithEvidence} from "../src/requirements/verification.js";

describe("requirement evidence provenance",()=>{
  it("rejects verified evidence attributed to another requirement",()=>{
    const project=createProject("Provenance gate");
    project.requirements.push({id:"REQ-1",name:"Load",priority:"MUST",status:"OPEN"});
    const traceability=new RequirementTraceability();
    traceability.addRequirement({
      id:"REQ-1",name:"Load",statement:"The part shall carry load.",
      kind:"ENGINEERING",priority:"MUST",status:"OPEN"
    });
    const memory=new EngineeringMemory();
    const evidence={
      id:"e1",type:"SIMULATION" as const,claim:"Other requirement verified.",
      status:"VERIFIED" as const,requirementIds:["REQ-2"],timestamp:new Date().toISOString()
    };
    const result=verifyRequirementWithEvidence(project,memory,traceability,"REQ-1",evidence);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain("not explicitly attributed");
  });
});
