import {describe,expect,it} from "vitest";
import {verifyResearchFinding} from "../src/research/verification.js";
import {ingestVerifiedResearch} from "../src/research/memory-ingestion.js";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";

const finding={id:"f1",claim:"A shaft shoulder can create a stress concentration.",sourceIds:["src1"],confidence:"MEDIUM" as const,informationStatus:"ASSUMED" as const};

describe("research verification gate",()=>{
  it("requires a URI when verifying by source inspection",()=>{
    const result=verifyResearchFinding({finding,method:"SOURCE_INSPECTION",verifier:"engineer"});
    expect(result.verified).toBe(false);
    expect(result.informationStatus).toBe("ASSUMED");
  });

  it("promotes a finding only after an explicit verification method",()=>{
    const result=verifyResearchFinding({finding,method:"HUMAN_REVIEW",verifier:"engineer",notes:"Reviewed against the cited paper."});
    expect(result.verified).toBe(true);
    expect(result.evidence.status).toBe("VERIFIED");
  });

  it("rejects unverified evidence from memory ingestion",()=>{
    const project=createProject("Research gate");
    const memory=new EngineeringMemory();
    const result=ingestVerifiedResearch(project,memory,{
      id:"e1",type:"SOURCE",claim:"candidate",status:"ASSUMED",timestamp:new Date().toISOString()
    });
    expect(result.ingested).toBe(false);
    expect(memory.getEvidence("e1")).toBeUndefined();
  });

  it("ingests verified evidence and links it to a requirement",()=>{
    const project=createProject("Research gate");
    project.requirements.push({id:"REQ-1",name:"Material evidence",priority:"MUST",status:"OPEN"});
    const memory=new EngineeringMemory();
    const evidence={id:"e2",type:"HUMAN_REVIEW" as const,claim:"Material property confirmed.",status:"VERIFIED" as const,timestamp:new Date().toISOString()};
    const result=ingestVerifiedResearch(project,memory,evidence,["REQ-1"]);
    expect(result.ingested).toBe(true);
    expect(project.evidenceIds).toContain("e2");
    expect(memory.evidenceForRequirement(project.id,"REQ-1")).toHaveLength(1);
  });
});
