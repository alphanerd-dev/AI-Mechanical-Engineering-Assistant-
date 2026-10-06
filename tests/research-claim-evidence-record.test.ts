import {describe,expect,it} from "vitest";
import {claimEvidenceRecord} from "../src/research/claim-evidence-record.js";

describe("claim evidence record",()=>{
  it("preserves claim, excerpt, location and provenance",()=>{
    const record=claimEvidenceRecord({
      id:"claim-evidence:f1",
      findingId:"f1",
      sourceId:"s1",
      claim:"Fatigue limits allowable stress.",
      excerpt:"The allowable stress is limited by fatigue.",
      location:"page 12, equation 4.2",
      extractionId:"extraction:s1",
      status:"CANDIDATE"
    });
    expect(record.status).toBe("ASSUMED");
    expect(record.claim).toContain("Fatigue");
    expect(record.value).toMatchObject({
      excerpt:"The allowable stress is limited by fatigue.",
      location:"page 12, equation 4.2",
      extractionId:"extraction:s1",
      findingId:"f1"
    });
  });
});
