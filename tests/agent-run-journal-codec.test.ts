import { describe, expect, it } from "vitest";
import {
  buildValidatedAgentRunRow, toValidatedAgentRunRecord
} from "../src/orchestration/agent-run-journal-validation.js";

const validRun = {
  id: "8e3d4d91-ef70-4c5d-94f7-6b83c92d83d1",
  owner_id: "c9c7c08d-7e7a-4c4f-bf73-6f16f24d6c72",
  project_id: "9f2dcb7b-bf1b-49a6-a0d2-9f4ccff1c233",
  status: "PLANNED",
  initial_graph_revision: 4,
  current_graph_revision: 4,
  plan_hash: "a".repeat(64),
  request_hash: "b".repeat(64),
  plan: { actions: [{ kind: "EXECUTE_TASK" }] },
  checkpoint: {},
  action_history: [],
  next_action_index: 0,
  current_action: null,
  cancel_requested_at: null,
  error: null,
  created_at: "2026-11-15T12:00:00.000Z",
  updated_at: "2026-11-15T12:00:00.000Z"
};

describe("agent-run journal codec", () => {
  it("decodes a valid persisted run without discarding history", () => {
    const run = toValidatedAgentRunRecord(validRun);
    expect(run.id).toBe(validRun.id);
    expect(run.initialGraphRevision).toBe(4);
    expect(run.actionHistory).toEqual([]);
    expect(run.status).toBe("PLANNED");
  });

  it("fails closed on malformed history, hashes, revisions and counters", () => {
    expect(() => toValidatedAgentRunRecord({ ...validRun, action_history: [null] })).toThrow(/payload/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, plan_hash: "bad" })).toThrow(/plan hash/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, current_graph_revision: 3 })).toThrow(/current graph revision/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, next_action_index: 26 })).toThrow(/next action index/);
  });

  it("validates run UUIDs and bounded plan size before persistence", () => {
    const input = {
      runId: validRun.id,
      ownerId: validRun.owner_id,
      projectId: validRun.project_id,
      idempotencyKey: "agent-run-key-0001",
      initialGraphRevision: 4,
      taskGraphSnapshot: { revision: 4, tasks: [] },
      limitsSnapshot: { maxActions: 25 },
      plan: { baseGraphRevision: 4, actions: [{ kind: "EXECUTE_TASK" }] }
    };
    expect(buildValidatedAgentRunRow(input).status).toBe("PLANNED");
    expect(() => buildValidatedAgentRunRow({ ...input, runId: "not-a-uuid" })).toThrow(/UUID/);
    expect(() => buildValidatedAgentRunRow({ ...input, plan: { ...input.plan, actions: Array(26).fill({ kind: "STOP" }) } })).toThrow(/1 to 25/);
  });
});
