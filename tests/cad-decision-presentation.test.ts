import { describe, expect, it } from "vitest";
import { getCADDecisionNotice, getCADRetryGuidance } from "../src/cad/decision-presentation.js";

describe("CAD workspace decision presentation", () => {
  it("claims acceptance only for independently verified ACCEPTED results", () => {
    expect(getCADDecisionNotice({status:"ACCEPTED",verified:true})).toMatchObject({
      tone:"success",
      message:expect.stringContaining("independent geometry validation"),
    });
    expect(getCADDecisionNotice({status:"ACCEPTED",verified:false}).tone).toBe("neutral");
  });

  it("shows actionable input, unsupported-scope and approval outcomes", () => {
    expect(getCADDecisionNotice({status:"NEEDS_INPUT",verified:false,nextQuestion:"What length?"}).message).toBe("What length?");
    expect(getCADDecisionNotice({status:"UNSUPPORTED",verified:false,reason:"Only cylinders are supported."}).message).toBe("Only cylinders are supported.");
    expect(getCADDecisionNotice({status:"WAITING_APPROVAL",verified:false})).toMatchObject({
      tone:"warning", message:expect.stringContaining("authorized human approval"),
    });
  });

  it("presents failure states without implying acceptance", () => {
    for (const status of ["FAILED","REJECTED","BLOCKED","INCOMPLETE"]) {
      expect(getCADDecisionNotice({status,verified:false})).toMatchObject({
        tone:"error", message:expect.stringContaining(status),
      });
    }
  });
});

describe("CAD retry guidance", () => {
  it("tells users to preserve their draft and inspect history before retrying", () => {
    for (const kind of ["network","no_decision"] as const) {
      const message=getCADRetryGuidance(kind);
      expect(message).toContain("draft is preserved");
      expect(message).toContain("Refresh completion history before retrying");
    }
  });
});
