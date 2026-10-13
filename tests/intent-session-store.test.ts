import { describe, expect, it } from "vitest";
import type { EngineeringIntentInterpretation } from "../src/intent/types.js";
import {
  InMemoryEngineeringIntentSessionStore,
  SupabaseEngineeringIntentSessionStore,
} from "../src/intent/session.js";

const interpretation: EngineeringIntentInterpretation = {
  raw: "Design a shaft",
  goal: "Design a shaft",
  completionUnit: "shaft",
  extractedInputs: { powerKw: 5, speedRpm: 1500 },
  missingInputs: ["diameter"],
  confidence: "HIGH",
  ambiguity: "LOW",
  contextUsed: ["project"],
  assumptions: [],
};

type Row = {
  project_id: string;
  session_id: string;
  interpretation: unknown;
  updated_at: string;
};

function createSharedDatabase() {
  const rows = new Map<string, Row>();
  const key = (projectId: string, sessionId: string) => `${projectId}::${sessionId}`;

  const client = {
    from(table: string) {
      if (table !== "engineering_intent_sessions") throw new Error("Unexpected table");
      return {
        select() {
          return {
            eq(columnA: string, valueA: string) {
              return {
                eq(columnB: string, valueB: string) {
                  return {
                    maybeSingle: async () => {
                      const projectId = columnA === "project_id" ? valueA : valueB;
                      const sessionId = columnA === "session_id" ? valueA : valueB;
                      const row = rows.get(key(projectId, sessionId));
                      return { data: row ?? null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        upsert(row: Row) {
          rows.set(key(row.project_id, row.session_id), structuredClone(row));
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(columnA: string, valueA: string) {
              return {
                eq(columnB: string, valueB: string) {
                  const projectId = columnA === "project_id" ? valueA : valueB;
                  const sessionId = columnA === "session_id" ? valueA : valueB;
                  rows.delete(key(projectId, sessionId));
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  return { client, rows };
}

describe("engineering intent session stores", () => {
  it("keeps the in-memory adapter compatible with the asynchronous store contract", async () => {
    const store = new InMemoryEngineeringIntentSessionStore();
    await store.save({
      sessionId: "session-1",
      projectId: "project-1",
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    });

    const stored = await store.get("session-1", "project-1");
    expect(stored?.interpretation.extractedInputs.powerKw).toBe(5);
    await store.delete("session-1", "project-1");
    expect(await store.get("session-1", "project-1")).toBeUndefined();
  });

  it("shares a session between independent store instances", async () => {
    const { client } = createSharedDatabase();
    const first = new SupabaseEngineeringIntentSessionStore(client as never);
    const second = new SupabaseEngineeringIntentSessionStore(client as never);
    const session = {
      sessionId: "session-1",
      projectId: "project-1",
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    };

    await first.save(session);

    expect(await second.get("session-1", "project-1")).toEqual(session);
  });

  it("isolates identical session IDs across projects", async () => {
    const { client } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    await store.save({
      sessionId: "same-id",
      projectId: "project-1",
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    });
    await store.save({
      sessionId: "same-id",
      projectId: "project-2",
      interpretation: { ...interpretation, goal: "Different project" },
      updatedAt: "2026-10-13T12:01:00.000Z",
    });

    expect((await store.get("same-id", "project-1"))?.interpretation.goal).toBe("Design a shaft");
    expect((await store.get("same-id", "project-2"))?.interpretation.goal).toBe("Different project");
  });

  it("rejects malformed stored interpretations instead of trusting database JSON", async () => {
    const { client, rows } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    rows.set("project-1::bad-session", {
      project_id: "project-1",
      session_id: "bad-session",
      interpretation: { extractedInputs: { powerKw: "not-a-number" } },
      updated_at: "2026-10-13T12:00:00.000Z",
    });

    await expect(store.get("bad-session", "project-1")).rejects.toThrow(
      "Stored engineering intent session is invalid.",
    );
  });

  it("returns a defensive copy so callers cannot mutate persisted session state", async () => {
    const { client } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    await store.save({
      sessionId: "session-1",
      projectId: "project-1",
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    });

    const result = await store.get("session-1", "project-1");
    result!.interpretation.extractedInputs.powerKw = 999;

    expect((await store.get("session-1", "project-1"))?.interpretation.extractedInputs.powerKw).toBe(5);
  });
});
