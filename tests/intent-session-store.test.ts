import { describe, expect, it } from "vitest";
import type { EngineeringIntentInterpretation } from "../src/intent/types.js";
import {
  ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
  EngineeringIntentSessionConflictError,
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
  schema_version?: number;
  snapshot_revision?: number;
  conversation?: unknown;
  updated_at: string;
};

interface UpdateQuery {
  eq(column: string, value: unknown): UpdateQuery;
  select(columns: string): UpdateQuery;
  maybeSingle(): Promise<{
    data: { snapshot_revision?: number } | null;
    error: unknown | null;
  }>;
}

function rowValue(row: Row, column: string): unknown {
  switch (column) {
    case "project_id": return row.project_id;
    case "session_id": return row.session_id;
    case "snapshot_revision": return row.snapshot_revision;
    default: return undefined;
  }
}

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
        insert(values: Record<string, unknown>) {
          const row = values as unknown as Row;
          return {
            select() { return this; },
            maybeSingle: async () => {
              const rowKey = key(row.project_id, row.session_id);
              if (rows.has(rowKey)) return { data: null, error: { code: "23505" } };
              rows.set(rowKey, structuredClone(row));
              return { data: { snapshot_revision: row.snapshot_revision }, error: null };
            },
          };
        },
        update(values: Record<string, unknown>) {
          const updates = values as Partial<Row>;
          const filters: Array<[string, unknown]> = [];
          const builder: UpdateQuery = {
            eq(column: string, value: unknown) { filters.push([column, value]); return builder; },
            select() { return builder; },
            maybeSingle: async () => {
              const projectId = filters.find(([column]) => column === "project_id")?.[1];
              const sessionId = filters.find(([column]) => column === "session_id")?.[1];
              const rowKey = key(String(projectId), String(sessionId));
              const row = rows.get(rowKey);
              if (!row || !filters.every(([column, value]) => rowValue(row, column) === value)) {
                return { data: null, error: null };
              }
              const updated = { ...row, ...updates };
              rows.set(rowKey, updated);
              return { data: { snapshot_revision: updated.snapshot_revision }, error: null };
            },
          };
          return builder;
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
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      conversation: [],
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
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      conversation: [],
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    };

    await first.save(session);
    const saved = await second.get("session-1", "project-1");
    expect(saved?.snapshotRevision).toBe(1);
    expect(saved?.conversation).toEqual([]);
  });

  it("isolates identical session IDs across projects", async () => {
    const { client } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    await store.save({
      sessionId: "same-id",
      projectId: "project-1",
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      conversation: [],
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    });
    await store.save({
      sessionId: "same-id",
      projectId: "project-2",
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      conversation: [],
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
      schema_version: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshot_revision: 1,
      conversation: [],
      interpretation: { extractedInputs: { powerKw: "not-a-number" } },
      updated_at: "2026-10-13T12:00:00.000Z",
    });

    await expect(store.get("bad-session", "project-1")).rejects.toThrow(
      "Stored engineering intent session is invalid.",
    );
  });

  it("rejects stale revision writes in the Supabase adapter", async () => {
    const { client } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    const session = {
      sessionId: "cas-session",
      projectId: "project-1",
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      interpretation,
      conversation: [],
      updatedAt: "2026-10-13T12:00:00.000Z",
    };

    await store.save(session, { createOnly: true });
    const first = (await store.get("cas-session", "project-1"))!;
    await store.save({
      ...first,
      conversation: [{ role: "engineer", text: "Design a shaft" }],
      updatedAt: "2026-10-13T12:01:00.000Z",
    }, { expectedRevision: first.snapshotRevision });

    await expect(store.save({
      ...first,
      conversation: [{ role: "engineer", text: "Stale write" }],
      updatedAt: "2026-10-13T12:02:00.000Z",
    }, { expectedRevision: first.snapshotRevision })).rejects.toBeInstanceOf(EngineeringIntentSessionConflictError);

    expect((await store.get("cas-session", "project-1"))?.conversation).toEqual([
      { role: "engineer", text: "Design a shaft" },
    ]);
  });

  it("returns a defensive copy so callers cannot mutate persisted session state", async () => {
    const { client } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    await store.save({
      sessionId: "session-1",
      projectId: "project-1",
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      conversation: [],
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    });

    const result = await store.get("session-1", "project-1");
    result!.interpretation.extractedInputs.powerKw = 999;

    expect((await store.get("session-1", "project-1"))?.interpretation.extractedInputs.powerKw).toBe(5);
  });
});
