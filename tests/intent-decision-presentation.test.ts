import {describe,expect,it} from "vitest";
import {getEngineeringDecisionPresentation} from "../src/intent/decision-presentation.js";

describe("engineering decision presentation",()=>{
  it("does not imply execution from READY",()=>{
    const result=getEngineeringDecisionPresentation({status:"READY",validationPassed:false,evidenceIds:[]});
    expect(result.tone).toBe("neutral");
    expect(result.message).toContain("does not mean an engineering operation has executed");
  });

  it("keeps proposal, execution, validation, verification, and approval distinct",()=>{
    const proposed=getEngineeringDecisionPresentation({status:"PROPOSED",validationPassed:false,evidenceIds:[]});
    const executed=getEngineeringDecisionPresentation({status:"EXECUTED",validationPassed:false,evidenceIds:[]});
    const validated=getEngineeringDecisionPresentation({status:"VALIDATED",validationPassed:true,evidenceIds:["receipt-1"]});
    const verifiedNoEvidence=getEngineeringDecisionPresentation({status:"VERIFIED",validationPassed:true,evidenceIds:[]});
    const approvedUnvalidated=getEngineeringDecisionPresentation({status:"APPROVED",validationPassed:false,evidenceIds:["approval-1"]});
    expect(proposed.message).toContain("has not been executed");
    expect(executed.message).toContain("does not by itself establish engineering correctness");
    expect(validated.message).toContain("Human approval and release are separate");
    expect(verifiedNoEvidence.tone).toBe("attention");
    expect(verifiedNoEvidence.message).toContain("no linked evidence");
    expect(approvedUnvalidated.message).toContain("not confirmed");
  });

  it("flags stale and cancelled outcomes without implying a current accepted result",()=>{
    const stale=getEngineeringDecisionPresentation({status:"STALE",validationPassed:true,evidenceIds:["old-receipt"]});
    const cancelled=getEngineeringDecisionPresentation({status:"CANCELLED",validationPassed:false,evidenceIds:[]});
    expect(stale.title).toBe("Result is stale");
    expect(stale.message).toContain("Do not use this result as current");
    expect(cancelled.title).toBe("Operation cancelled");
    expect(cancelled.message).toContain("cancelled");
  });

  it("asks for the material input returned by the workflow",()=>{
    const result=getEngineeringDecisionPresentation({status:"NEEDS_INPUT",validationPassed:false,evidenceIds:[],nextQuestion:"What is the bending moment?"});
    expect(result.tone).toBe("attention");
    expect(result.message).toBe("What is the bending moment?");
  });

  it("keeps passing checks distinct from an outstanding approval",()=>{
    const result=getEngineeringDecisionPresentation({status:"WAITING_APPROVAL",validationPassed:true,evidenceIds:["evidence-1"]});
    expect(result.title).toBe("Awaiting human approval");
    expect(result.message).toContain("not released");
    expect(result.message).toContain("authorized human decision");
  });

  it("does not imply verified completion when linked evidence is absent",()=>{
    const result=getEngineeringDecisionPresentation({status:"COMPLETE",validationPassed:true,evidenceIds:[]});
    expect(result.tone).toBe("attention");
    expect(result.title).toBe("Completion reported; evidence missing");
    expect(result.message).toContain("not traceably verified");
  });

  it("limits positive completion copy to results with checks and linked evidence",()=>{
    const result=getEngineeringDecisionPresentation({status:"COMPLETE",validationPassed:true,evidenceIds:["evidence-1"]});
    expect(result.tone).toBe("positive");
    expect(result.message).toContain("not design, regulatory, or safety approval");
    expect(result.evidenceMessage).toContain("1 evidence record linked");
  });

  it("does not let a COMPLETE status with failed checks look positive",()=>{
    const result=getEngineeringDecisionPresentation({status:"COMPLETE",validationPassed:false,evidenceIds:["evidence-1"]});
    expect(result.tone).toBe("attention");
    expect(result.title).toBe("Completion reported; checks not confirmed");
  });

  it("gives explicit, actionable copy for failures and blocked capabilities",()=>{
    const failed=getEngineeringDecisionPresentation({status:"FAILED",validationPassed:false,evidenceIds:[]});
    const blocked=getEngineeringDecisionPresentation({status:"BLOCKED",validationPassed:false,evidenceIds:[],nextAction:"Configure the isolated worker."});
    expect(failed.tone).toBe("danger");
    expect(failed.message).toContain("did not produce a completed engineering outcome");
    expect(blocked.tone).toBe("attention");
    expect(blocked.message).toBe("Configure the isolated worker.");
  });

  it("pluralizes evidence records and preserves a neutral fallback",()=>{
    const linked=getEngineeringDecisionPresentation({status:"REVIEWING",validationPassed:false,evidenceIds:["a","b"]});
    const unknown=getEngineeringDecisionPresentation({status:"",validationPassed:false,evidenceIds:[]});
    expect(linked.evidenceMessage).toContain("2 evidence records linked");
    expect(unknown.title).toBe("Decision status: UNKNOWN");
  });
});
