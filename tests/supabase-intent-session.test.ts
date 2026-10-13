import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngineeringIntentSession } from "../src/intent/session.js";
import { SupabaseEngineeringIntentSessionStore } from "../src/providers/supabase-intent-session.js";

type Row = Record<string, unknown>;

type FakeQuery = {
  select: () => FakeQuery;
  eq: (column: string, value: unknown) => FakeQuery;
  maybeSingle: () => Promise<{ data: Row | null; error: unknown | null }>;
  upsert: (row: Row) => Promise<{ error: unknown | null }>;
  delete: () => FakeQuery;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

function createSupabaseHarness(seed: Row[] = [], errors: { read?: unknown; write?: unknown } = {}) {
  const rows = seed.map((row) => ({ ...row }));
  const from = vi.fn((table: string) => {
    if (table !== "engineering_intent_sessions") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const filters: Record<string, unknown> = {};
    let deleting = false;
    const query = {} as FakeQuery;
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return query;
    });
    query.maybeSingle = vi.fn(async () => {
      if (errors.read) return { data: null, error: errors.read };
      const row = rows.find((candidate) =>
        Object.entries(filters).every(([key, value]) => candidate[key] === value),
      );
      return { data: row ? { ...row } : null, error: null };
    });
    query.upsert = vi.fn(async (row: Row) => {
      if (errors.write) return { error: errors.write };
      const index = rows.findIndex((candidate) =>
        candidate.project_id === row.project_id && candidate.session_id === row.session_id,
      );
      if (index >= 0) rows[index] = { ...row };
      else rows.push({ ...row });
      return { error: null };
    });
    query.delete = vi.fn(() => {
      deleting = true;
      return query;
    });
    query.then = (resolve, reject) => {
      if (errors.write) return Promise.resolve({ error: errors.write }).then(resolve, reject);
      if (deleting) {
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (Object.entries(filters).every(([key, value]) => rows[index][key] === value)) {
            rows.splice(index, 1);
          }
        }
      }
      return Promise.resolve({ error: null }).then(resolve, reject);
    };
    return query;
  });

  return {
    client: { from } as unknown as SupabaseClient,
    rows,
    from,
  };
}

function makeSession(projectId: string, sessionId: string, goal = "shaft design"): EngineeringIntentSession {
  return {
    projectId,
    sessionId,
    updatedAt: "2026-10-13T12:00:00.000Z",
    interpretation: {
      raw: "Design a shaft",
      goal,
      completionUnit: "ENGINEERING.COMPLETE_SHAFT",
      extractedInputs: { projectId, powerKw: 5 },
      missingInputs: ["bending moment"],
      confidence: "MEDIUM",
      ambiguity: "MEDIUM",
      contextUsed: ["powerKw"],
      assumptions: [],
    },
  };
}

describe("SupabaseEngineeringIntentSessionStore", () => {
  it("persists a session across independent store instances", async () => {
    const database = createSupabaseHarness();
    const firstInstance = new SupabaseEngineeringIntentSessionStore(database.client);
    const secondInstance = new SupabaseEngineeringIntentSessionStore(database.client);
    const session = makeSession("project-a", "session-1");

    await firstInstance.save(session);
    const loaded = await secondInstance.get("session-1", "project-a");

    expect(loaded).toEqual(session);
    expect(database.from).toHaveBeenCalledWith("engineering_intent_sessions");
  });

  it("scopes identical session IDs to separate projects", async () => {
    const database = createSupabaseHarness();
    const store = new SupabaseEngineeringIntentSessionStore(database.client);
    await store.save(makeSession("project-a", "shared-session", "project A goal"));
    await store.save(makeSession("project-b", "shared-session", "project B goal"));

    expect((await store.get("shared-session", "project-a"))?.interpretation.goal).toBe("project A goal");
    expect((await store.get("shared-session", "project-b"))?.interpretation.goal).toBe("project B goal");
  });

  it("deletes only the session scoped to the requested project", async () => {
    const database = createSupabaseHarness();
    const store = new SupabaseEngineeringIntentSessionStore(database.client);
    await store.save(makeSession("project-a", "shared-session"));
    await store.save(makeSession("project-b", "shared-session"));

    await store.delete("shared-session", "project-a");

    expect(await store.get("shared-session", "project-a")).toBeUndefined();
    expect(await store.get("shared-session", "project-b")).toBeDefined();
  });

  it("rejects malformed stored interpretations", async () => {
    const database = createSupabaseHarness([{
      session_id: "session-1",
      project_id: "project-a",
      interpretation: { raw: "missing fields" },
      updated_at: "2026-10-13T12:00:00.000Z",
    }]);
    const store = new SupabaseEngineeringIntentSessionStore(database.client);

    await expect(store.get("session-1", "project-a")).rejects.toThrow("Stored engineering intent session is invalid.");
  });

  it("does not expose database error details", async () => {
    const database = createSupabaseHarness([], { read: { message: "secret database internals" } });
    const store = new SupabaseEngineeringIntentSessionStore(database.client);

    await expect(store.get("session-1", "project-a")).rejects.toThrow("Engineering intent session lookup failed.");
  });
});
