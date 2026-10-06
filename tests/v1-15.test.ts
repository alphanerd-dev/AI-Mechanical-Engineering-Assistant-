import {describe,expect,it} from "vitest";
import {createProject} from "../src/state/project.js";
import {
  deserializeEngineeringWorkspaceSnapshot,
  InMemoryProjectStateStore,
  serializeEngineeringWorkspaceSnapshot,
  validateEngineeringWorkspaceSnapshot
} from "../src/state/persistence.js";

describe("V1.15 workspace persistence foundation",()=>{
  it("creates immutable versioned project snapshots",()=>{
    const project=createProject("bearing housing");
    const store=new InMemoryProjectStateStore();

    const first=store.save(project);
    project.name="mutated outside store";

    expect(first.schemaVersion).toBe(1);
    expect(first.revision).toBe(1);
    expect(store.get(project.id)?.project.name).toBe("bearing housing");
  });

  it("requires the current revision for updates",()=>{
    const store=new InMemoryProjectStateStore();
    const project=createProject("shaft");
    const first=store.save(project);
    project.name="shaft v2";

    expect(()=>store.save(project)).toThrow("Project revision is required for update");
    expect(()=>store.save(project,first.revision-1)).toThrow("Project revision conflict");

    const second=store.save(project,first.revision);
    expect(second.revision).toBe(2);
    expect(store.get(project.id)?.project.name).toBe("shaft v2");
  });

  it("supports JSON round-tripping with schema validation",()=>{
    const store=new InMemoryProjectStateStore();
    const project=createProject("gearbox");
    project.openQuestions.push("gear ratio");
    const snapshot=store.save(project);

    const restored=deserializeEngineeringWorkspaceSnapshot(
      serializeEngineeringWorkspaceSnapshot(snapshot)
    );

    expect(restored).toEqual(snapshot);
    validateEngineeringWorkspaceSnapshot(restored);
  });

  it("fails closed on unsupported or malformed snapshots",()=>{
    const store=new InMemoryProjectStateStore();
    const project=createProject("frame");
    const snapshot=store.save(project);

    const unsupported={...snapshot,schemaVersion:2};
    expect(()=>validateEngineeringWorkspaceSnapshot(
      unsupported as typeof snapshot
    )).toThrow("Unsupported workspace snapshot schema version");

    expect(()=>deserializeEngineeringWorkspaceSnapshot("not-json"))
      .toThrow("Workspace snapshot JSON is invalid.");

    const invalidRevision={...snapshot,revision:0};
    expect(()=>validateEngineeringWorkspaceSnapshot(
      invalidRevision as typeof snapshot
    )).toThrow("Workspace snapshot revision must be a positive integer.");
  });

  it("lists and deletes isolated project snapshots",()=>{
    const store=new InMemoryProjectStateStore();
    const a=createProject("A");
    const b=createProject("B");
    store.save(a);
    store.save(b);

    expect(store.list()).toHaveLength(2);
    expect(store.delete(a.id)).toBe(true);
    expect(store.get(a.id)).toBeUndefined();
    expect(store.delete(a.id)).toBe(false);
    expect(store.get(b.id)?.project.name).toBe("B");
  });
});
