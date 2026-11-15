import { describe, expect, it } from "vitest";
import {
  buildValidatedAgentRunRow, toValidatedAgentRunRecord
} from "../src/orchestration/agent-run-journal-validation.js";
import { canonicalAgentRunDigest } from "../src/orchestration/agent-run-journal-codec.js";

const runId = "8e3d4d91-ef70-4c5d-94f7-6b83c92d83d1";
const ownerId = "c9c7c08d-7e7a-4c4f-bf73-6f16f24d6c72";
const projectId = "9f2dcb7b-bf1b-49a6-a0d2-9f4ccff1c233";
const validInput = {
  runId,
  ownerId,
  projectId,
  idempotencyKey: "agent-run-key-0001",
  initialGraphRevision: 4,
  taskGraphSnapshot: { revision: 4, tasks: [] },
  limitsSnapshot: { maxActions: 25 },
  plan: { baseGraphRevision: 4, actions: [{ kind: "EXECUTE_TASK" }] }
};
const validRun = {
  ...buildValidatedAgentRunRow(validInput),
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
    expect(() => toValidatedAgentRunRecord({ ...validRun, plan_hash: "c".repeat(64) })).toThrow(/plan digest/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, request_hash: "d".repeat(64) })).toThrow(/request digest/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, current_graph_revision: 3 })).toThrow(/current graph revision/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, next_action_index: 26 })).toThrow(/next action index/);
  });

  it("validates run UUIDs and bounded plan size before persistence", () => {
    const input = {
      runId,
      ownerId,
      projectId,
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

  it("rejects malformed optional persisted fields without coercion", () => {
    expect(() => toValidatedAgentRunRecord({ ...validRun, current_action: "invalid" })).toThrow(/in-flight action/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, cancel_requested_at: 42 })).toThrow(/cancellation timestamp/);
    expect(() => toValidatedAgentRunRecord({ ...validRun, error: [] })).toThrow(/run error/);
    expect(toValidatedAgentRunRecord({ ...validRun, current_action: null, cancel_requested_at: null, error: null }).status).toBe("PLANNED");
  });

  it("keeps canonical run digests stable and rejects non-JSON values", () => {
    expect(canonicalAgentRunDigest({ b: 2, a: { y: 1, x: 0 } }))
      .toBe(canonicalAgentRunDigest({ a: { x: 0, y: 1 }, b: 2 }));
    expect(() => canonicalAgentRunDigest({ value: Number.NaN })).toThrow(/finite JSON/);
    const sparse = Array(1);
    expect(() => canonicalAgentRunDigest({ sparse })).toThrow(/dense JSON arrays/);
    const extended: number[] & { extra?: number } = [1];
    extended.extra = 2;
    expect(() => canonicalAgentRunDigest({ extended })).toThrow(/dense JSON arrays/);
    expect(() => canonicalAgentRunDigest({ date: new Date(0) })).toThrow(/plain JSON objects/);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalAgentRunDigest(circular)).toThrow(/circular/);
  });


  it("enforces contiguous action history and validates the in-flight action identity", () => {
    expect(() => toValidatedAgentRunRecord({ ...validRun, next_action_index: 1 }))
      .toThrow(/history does not match/);
    const action = { kind: "EXECUTE_TASK" };
    const actionHash = canonicalAgentRunDigest(action);
    const actionKey = "agent:" + runId + ":0:" + actionHash.slice(0, 32);
    const history = {
      actionIndex: 0,
      actionKey,
      actionHash,
      action,
      outcome: { success: true },
      graphRevision: 4,
      completedAt: "2026-11-15T12:01:00.000Z"
    };
    expect(toValidatedAgentRunRecord({
      ...validRun, action_history: [history], next_action_index: 1
    }).actionHistory).toEqual([history]);
    const inFlight = {
      actionIndex: 0,
      actionKey,
      actionHash,
      action,
      startedAt: "2026-11-15T12:00:30.000Z"
    };
    expect(toValidatedAgentRunRecord({ ...validRun, current_action: inFlight }).currentAction).toEqual(inFlight);
    expect(() => toValidatedAgentRunRecord({
      ...validRun, current_action: { ...inFlight, actionIndex: 1 }
    })).toThrow(/sequence/);
    expect(() => toValidatedAgentRunRecord({
      ...validRun,
      action_history: [{ ...history, action: { kind: "ALTERED" } }],
      next_action_index: 1
    })).toThrow(/digest does not match/);
  });

});
