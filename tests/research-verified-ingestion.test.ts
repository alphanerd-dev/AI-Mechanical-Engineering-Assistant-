import {describe,expect,it} from "vitest";
import {verifyAndIngestResearch} from "../src/research/verified-ingestion.js";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";

describe("verified research ingestion",()=>{
 it("fails closed when claim evidence is not explicitly verified",()=>{
  const project=createProject("Research");
  const memory=new EngineeringMemory();
  const result=verifyAndIngestResearch({
   project,memory,
   finding:{id:"f1",claim:"A finding",sourceIds:["s1"],confidence:"MEDIUM",informationStatus:"ASSUMED"},
   claimEvidence:{id:"ce1",findingId:"f1",sourceId:"s1",claim:"A finding",excerpt:"candidate",extractionId:"x1",status:"CANDIDATE"},
   method:"SOURCE_INSPECTION",verifier:"engineer"
  });
  expect(result.ingested).toBe(false);
  expect(memory.getEvidence("ce1")).toBeUndefined();
 });

 it("ingests only after explicit supporting evidence is supplied",()=>{
  const project=createProject("Research");
  project.requirements.push({id:"R1",name:"Evidence",priority:"MUST",status:"OPEN"});
  const memory=new EngineeringMemory();
  const result=verifyAndIngestResearch({
   project,memory,
   finding:{id:"f1",claim:"A finding",sourceIds:["s1"],confidence:"HIGH",informationStatus:"ASSUMED"},
   claimEvidence:{id:"ce1",findingId:"f1",sourceId:"s1",claim:"A finding",excerpt:"verified excerpt",location:"p.2",extractionId:"x1",status:"VERIFIED"},
   method:"HUMAN_REVIEW",verifier:"engineer",supportingEvidence:["review:123"],requirementIds:["R1"]
  });
  expect(result.ingested).toBe(true);
  expect(result.evidenceId).toBe("ce1");
  expect(memory.evidenceForRequirement(project.id,"R1")).toHaveLength(1);
 });
});
