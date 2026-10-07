import {describe,expect,it} from "vitest";
import {
  createEngineeringMemorySnapshot,
  deserializeEngineeringMemorySnapshot,
  InMemoryEngineeringMemoryStore,
  serializeEngineeringMemorySnapshot,
  validateEngineeringMemorySnapshot
} from "../src/memory/persistence.js";
import {ProjectState} from "../src/core/types.js";

function project(id="PROJECT-1"):ProjectState{
  return {
    id,
    name:"Memory persistence test",
    stage:"REQUIREMENTS",
    status:"ACTIVE",
    requirements:[{
      id:"REQ-1",
      name:"Strength",
      priority:"MUST",
      status:"SATISFIED"
    }],
    assumptions:[],
    openQuestions:[],
    unresolvedRisks:[],
    events:[]
  };
}

const evidence={
  "EVID-1":{
    id:"EVID-1",
    type:"CALCULATION" as const,
    claim:"Calculated shaft torque is within the requirement.",
    status:"VERIFIED" as const,
    artifactIds:["ART-1"],
    requirementIds:["REQ-1"],
    timestamp:"2026-10-07T10:00:00.000Z"
  }
};

const artifacts={
  "ART-1":{
    projectId:"PROJECT-1",
    artifact:{
      id:"ART-1",
      kind:"FEA_RESULT" as const,
      name:"Verified strength result",
      validationStatus:"PASS" as const,
      informationStatus:"VERIFIED" as const,
      evidenceIds:["EVID-1"],
      requirementIds:["REQ-1"],
      createdAt:"2026-10-07T10:00:00.000Z"
    }
  }
};

describe("V2.0.3 project memory persistence",()=>{
  it("round-trips a verified project memory snapshot",()=>{
    const snapshot=createEngineeringMemorySnapshot(
      project(),
      1,
      evidence,
      artifacts,
      {"REQ-1":["EVID-1"]}
    );
    const restored=deserializeEngineeringMemorySnapshot(serializeEngineeringMemorySnapshot(snapshot));

    expect(restored).toEqual(snapshot);
  });

  it("stores immutable snapshots with optimistic revision protection",()=>{
    const store=new InMemoryEngineeringMemoryStore();
    const first=createEngineeringMemorySnapshot(project(),1);
    const saved=store.save(first,0);

    saved.project.name="mutated";
    const read=store.get("PROJECT-1")!;
    expect(read.project.name).toBe("Memory persistence test");

    const next=createEngineeringMemorySnapshot({...read.project,name:"Updated"},2);
    store.save(next,1);

    expect(()=>store.save(next,1)).toThrow("revision conflict");
  });

  it("rejects unverified evidence",()=>{
    const invalid=createEngineeringMemorySnapshot(project(),1);
    invalid.evidence["EVID-BAD"]={
      ...evidence["EVID-1"],
      id:"EVID-BAD",
      status:"CALCULATED"
    };

    expect(()=>validateEngineeringMemorySnapshot(invalid)).toThrow("only accepts VERIFIED evidence");
  });

  it("rejects cross-project artifact ownership",()=>{
    const invalid=createEngineeringMemorySnapshot(project(),1,evidence,{
      "ART-1":{...artifacts["ART-1"],projectId:"PROJECT-2"}
    });

    expect(()=>validateEngineeringMemorySnapshot(invalid)).toThrow("crosses project boundary");
  });

  it("rejects broken evidence and requirement lineage",()=>{
    const invalid=createEngineeringMemorySnapshot(project(),1,{
      "EVID-1":{
        ...evidence["EVID-1"],
        artifactIds:["MISSING-ARTIFACT"],
        requirementIds:["MISSING-REQ"]
      }
    });

    expect(()=>validateEngineeringMemorySnapshot(invalid)).toThrow("unknown artifact");
  });
});
