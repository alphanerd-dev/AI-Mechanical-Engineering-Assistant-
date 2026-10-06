import {describe,expect,it} from "vitest";
import {createClaimEvidence} from "../src/research/claim-evidence.js";

describe("claim evidence",()=>{
  it("binds a claim to the inspected source location",()=>{
    const evidence=createClaimEvidence(
      {
        id:"finding-1",
        claim:"Allowable stress is limited by fatigue.",
        sourceIds:["source-1"],
        confidence:"HIGH",
        informationStatus:"ASSUMED",
        extractionId:"extraction:source-1"
      },
      {
        id:"extraction:source-1",
        sourceId:"source-1",
        excerpt:"The allowable stress is limited by fatigue.",
        location:"page 12, equation 4.2",
        extractedAt:"2026-10-06T00:00:00.000Z",
        extractor:"test",
        status:"CANDIDATE"
      }
    );
    expect(evidence.claim).toContain("Allowable stress");
    expect(evidence.location).toBe("page 12, equation 4.2");
    expect(evidence.status).toBe("CANDIDATE");
  });

  it("rejects mismatched provenance",()=>{
    expect(()=>createClaimEvidence(
      {
        id:"finding-2",
        claim:"Claim",
        sourceIds:["source-2"],
        confidence:"HIGH",
        informationStatus:"ASSUMED",
        extractionId:"extraction:source-2"
      },
      {
        id:"extraction:source-1",
        sourceId:"source-1",
        excerpt:"Evidence",
        extractedAt:"2026-10-06T00:00:00.000Z",
        extractor:"test",
        status:"CANDIDATE"
      }
    )).toThrow();
  });
});
