import {describe,expect,it} from "vitest";
import {EngineeringArtifact} from "../src/artifacts/engineering-artifacts.js";
import {
  createEngineeringArtifactRecord,
  InMemoryArtifactStore,
  validateEngineeringArtifactRecord
} from "../src/artifacts/persistence.js";

function artifact(id="artifact-1"):EngineeringArtifact{
  return {
    id,
    kind:"STEP",
    name:"test part",
    backend:"reference",
    validationStatus:"PASS",
    informationStatus:"VERIFIED",
    evidenceIds:["evidence-1"],
    requirementIds:["REQ-1"],
    createdAt:"2026-10-06T17:00:00.000Z"
  };
}

describe("V1.16 artifact registry persistence foundation",()=>{
  it("stores immutable project-scoped artifact metadata",()=>{
    const store=new InMemoryArtifactStore();
    const first=store.save(createEngineeringArtifactRecord(artifact(),1,"project-1"));

    first.artifact.name="mutated outside store";
    expect(store.get("artifact-1")?.artifact.name).toBe("test part");
    expect(store.list("project-1")).toHaveLength(1);
    expect(store.list("other-project")).toHaveLength(0);
  });

  it("requires optimistic revision protection for updates",()=>{
    const store=new InMemoryArtifactStore();
    const first=store.save(createEngineeringArtifactRecord(artifact(),1));

    const updated=createEngineeringArtifactRecord(
      {...artifact(),name:"test part v2"},
      2
    );

    expect(()=>store.save(updated)).toThrow("Artifact revision is required for update");
    expect(()=>store.save(updated,first.revision-1)).toThrow("Artifact revision conflict");
    expect(store.save(updated,first.revision).revision).toBe(2);
  });

  it("rejects invalid revision progression and invalid records",()=>{
    const store=new InMemoryArtifactStore();

    expect(()=>store.save(createEngineeringArtifactRecord(artifact(),2)))
      .toThrow("New artifact records must start at revision 1");

    const first=store.save(createEngineeringArtifactRecord(artifact(),1));
    expect(()=>store.save(
      createEngineeringArtifactRecord({...artifact(),name:"v3"},3),
      first.revision
    )).toThrow("Artifact revision must advance by one");

    const invalid={...first,revision:0};
    expect(()=>validateEngineeringArtifactRecord(
      invalid as typeof first
    )).toThrow("Artifact record revision must be a positive integer.");
  });

  it("returns isolated records and supports deletion",()=>{
    const store=new InMemoryArtifactStore();
    store.save(createEngineeringArtifactRecord(artifact("a"),1,"p"));
    store.save(createEngineeringArtifactRecord(artifact("b"),1,"p"));

    const listed=store.list("p");
    listed[0].artifact.name="changed";
    expect(store.get(listed[0].artifact.id)?.artifact.name).toBe("test part");

    expect(store.delete("a")).toBe(true);
    expect(store.get("a")).toBeUndefined();
    expect(store.delete("a")).toBe(false);
    expect(store.list("p")).toHaveLength(1);
  });
});
