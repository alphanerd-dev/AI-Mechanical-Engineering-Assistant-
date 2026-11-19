import { describe, expect, it } from "vitest";
import {
  canonicalAgentRunDigest,
  createAgentActionIdentity
} from "../src/orchestration/durable-agent-run-journal.js";

describe("durable agent-run identity", () => {
  it("canonicalizes object key order before hashing", () => {
    expect(canonicalAgentRunDigest({ a: 1, nested: { x: true, y: 2 } }))
      .toBe(canonicalAgentRunDigest({ nested: { y: 2, x: true }, a: 1 }));
  });

  it("changes the action identity when sequence or action content changes", () => {
    const action = { kind: "EXECUTE_TASK", taskId: "task-1", stage: "CAD" };
    const first = createAgentActionIdentity("run-1", 0, action);
    const same = createAgentActionIdentity("run-1", 0, { stage: "CAD", taskId: "task-1", kind: "EXECUTE_TASK" });
    const nextIndex = createAgentActionIdentity("run-1", 1, action);
    const changed = createAgentActionIdentity("run-1", 0, { ...action, stage: "SIMULATION" });
    expect(first.actionHash).toBe(same.actionHash);
    expect(first.actionKey).toBe(same.actionKey);
    expect(first.actionKey).not.toBe(nextIndex.actionKey);
    expect(first.actionHash).not.toBe(changed.actionHash);
  });

  it("rejects invalid action indexes and non-JSON digest inputs", () => {
    expect(() => createAgentActionIdentity("run-1", 25, { kind: "STOP" })).toThrow(/index/);
    expect(() => canonicalAgentRunDigest({ value: Number.POSITIVE_INFINITY })).toThrow(/finite JSON/);
    expect(() => canonicalAgentRunDigest({ value: undefined })).toThrow(/finite JSON/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalAgentRunDigest(cyclic)).toThrow(/circular/);
  });
});
