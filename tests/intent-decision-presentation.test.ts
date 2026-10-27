import {describe,expect,it} from "vitest";
import {getEngineeringDecisionPresentation} from "../src/intent/decision-presentation.js";

describe("engineering decision presentation",()=>{
  it("does not imply execution from READY",()=>{
    const result=getEngineeringDecisionPresentation({status:"READY",validationPassed:false,evidenceIds:[]});
    expect(result.tone).toBe("neutral");
    expect(result.message).toContain("does not mean an engineering operation has executed");
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
