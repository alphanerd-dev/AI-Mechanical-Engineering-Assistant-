import { describe, expect, it } from "vitest";
import {
  ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
  InMemoryEngineeringIntentSessionStore,
  assertSession,
  createEmptySession,
  parseConversation,
} from "./session.js";
import type { EngineeringIntentInterpretation } from "./types.js";

const interpretation: EngineeringIntentInterpretation = {
  raw: "shaft torque 5 kW 1500 rpm",
  goal: "shaft sizing",
  completionUnit: "shaft",
  extractedInputs: { powerKw: 5, speedRpm: 1500 },
  missingInputs: [],
  confidence: "HIGH",
  ambiguity: "LOW",
  contextUsed: ["powerKw", "speedRpm"],
  assumptions: [],
};

describe("parseConversation", () => {
  it("accepts empty and valid messages", () => {
    expect(parseConversation(undefined)).toEqual([]);
    expect(parseConversation([])).toEqual([]);
    expect(parseConversation([
      { role: "engineer", text: "Design a shaft", at: "2026-10-13T12:00:00.000Z" },
      {
        role: "assistant",
        text: "Need bending moment",
        decision: {
          status: "NEEDS_INPUT",
          validationPassed: false,
          metrics: [],
          evidenceIds: [],
          nextQuestion: "bending moment",
        },
      },
    ])).toHaveLength(2);
  });

  it("rejects malformed conversation payloads", () => {
    expect(() => parseConversation({})).toThrow(/array/);
    expect(() => parseConversation([{ role: "system", text: "x" }])).toThrow(/role/);
    expect(() => parseConversation([{ role: "engineer", text: "" }])).toThrow(/text/);
    expect(() => parseConversation([{ role: "engineer", text: "x", at: "not-a-date" }])).toThrow(/timestamp/);
  });
});

describe("InMemoryEngineeringIntentSessionStore", () => {
  it("saves and restores a project-scoped session with conversation", async () => {
    const store = new InMemoryEngineeringIntentSessionStore();
    const session = {
      sessionId: "session-a",
      projectId: "project-1",
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      interpretation,
      conversation: [
        { role: "engineer" as const, text: "Design a shaft that transmits 5 kW at 1500 rpm." },
        { role: "assistant" as const, text: "Need bending moment." },
      ],
      updatedAt: "2026-10-13T12:00:00.000Z",
    };

    await store.save(session);
    const restored = await store.get("session-a", "project-1");
    expect(restored?.conversation).toHaveLength(2);
    expect(restored?.interpretation.extractedInputs.powerKw).toBe(5);

    // Cross-project lookup must not return the session.
    expect(await store.get("session-a", "project-2")).toBeUndefined();
  });

  it("rejects invalid session identity", async () => {
    const store = new InMemoryEngineeringIntentSessionStore();
    await expect(store.save({
      sessionId: "",
      projectId: "project-1",
      schemaVersion: 1,
      interpretation,
      conversation: [],
      updatedAt: "2026-10-13T12:00:00.000Z",
    })).rejects.toThrow(/sessionId/);
  });

  it("deletes only the targeted session", async () => {
    const store = new InMemoryEngineeringIntentSessionStore();
    const base = createEmptySession("session-a", "project-1");
    base.interpretation = interpretation;
    await store.save(base);
    await store.delete("session-a", "project-1");
    expect(await store.get("session-a", "project-1")).toBeUndefined();
  });
});

describe("assertSession", () => {
  it("accepts a valid empty session", () => {
    expect(() => assertSession(createEmptySession("s1", "p1"))).not.toThrow();
  });
});
