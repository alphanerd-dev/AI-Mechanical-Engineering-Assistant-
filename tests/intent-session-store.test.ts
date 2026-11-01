import { describe, expect, it, vi } from "vitest";
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
  chat_title?: string;
  message_count?: number;
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
        select(columns: string) {
          const selectedColumns = columns.split(",").map((column) => column.trim());
          return {
            eq(columnA: string, valueA: string) {
              return {
                eq(columnB: string, valueB: string) {
                  return {
                    maybeSingle: async () => {
                      const projectId = columnA === "project_id" ? valueA : valueB;
                      const sessionId = columnA === "session_id" ? valueA : valueB;
                      const row = rows.get(key(projectId, sessionId));
                      if (!row) return { data: null, error: null };
                      const data = Object.fromEntries(
                        selectedColumns
                          .filter((column) => column in row)
                          .map((column) => [column, row[column as keyof Row]]),
                      );
                      return { data, error: null };
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

  it("lists only a project's chat sessions newest first and returns defensive copies", async () => {
    const store = new InMemoryEngineeringIntentSessionStore();
    const makeSession = (sessionId: string, projectId: string, updatedAt: string) => ({
      sessionId,
      projectId,
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      conversation: [{ role: "engineer" as const, text: sessionId }],
      interpretation,
      updatedAt,
    });
    await store.save(makeSession("engineering-chat-old", "project-1", "2026-10-30T10:00:00.000Z"));
    await store.save(makeSession("engineering-chat-new", "project-1", "2026-10-31T10:00:00.000Z"));
    await store.save(makeSession("engineering-chat-other-project", "project-2", "2026-11-01T10:00:00.000Z"));
    await store.save(makeSession("task-session", "project-1", "2026-11-02T10:00:00.000Z"));

    const listed = await store.listChatSessions("project-1");
    expect(listed.map(session => session.sessionId)).toEqual([
      "engineering-chat-new",
      "engineering-chat-old",
    ]);
    listed[0].title = "mutated copy";
    expect((await store.listChatSessions("project-1"))[0].title).toBe("engineering-chat-new");
    expect(await store.listChatSessions("project-1", 1)).toHaveLength(1);
  });

  it("lists Supabase chat sessions using project scope, prefix and bounded recency", async () => {
    const row = {
      project_id: "project-1",
      session_id: "engineering-chat-session-1",
      interpretation,
      conversation: [{ role: "engineer", text: "Design a pump bracket" }],
      chat_title: "Design a pump bracket",
      message_count: 1,
      schema_version: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshot_revision: 3,
      updated_at: "2026-10-31T10:00:00.000Z",
    };
    const query = {
      select: () => query,
      eq: () => query,
      like: () => query,
      order: () => query,
      limit: vi.fn(() => query),
      then: (resolve: (value: { data: typeof row[]; error: null }) => unknown) =>
        Promise.resolve({ data: [row], error: null }).then(resolve),
    };
    const client = { from: vi.fn(() => query) };
    const store = new SupabaseEngineeringIntentSessionStore(client as never);

    const listed = await store.listChatSessions("project-1", 500);
    expect(listed.map(session => session.sessionId)).toEqual(["engineering-chat-session-1"]);
    expect(client.from).toHaveBeenCalledWith("engineering_intent_sessions");
    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it("persists title and visible-message count as lightweight chat-list metadata", async () => {
    const { client, rows } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    await store.save({
      sessionId: "engineering-chat-title-metadata",
      projectId: "project-1",
      schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision: 1,
      conversation: [
        { role: "engineer", text: "Design a guarded belt drive" },
        { role: "assistant", text: "Start with the power and speed." },
      ],
      interpretation,
      updatedAt: "2026-10-31T10:00:00.000Z",
    }, { createOnly: true });

    const row = rows.get("project-1::engineering-chat-title-metadata");
    expect(row?.chat_title).toBe("Design a guarded belt drive");
    expect(row?.message_count).toBe(2);
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

  it("fails closed on malformed persisted snapshots and nested decisions", async () => {
    const { client, rows } = createSharedDatabase();
    const store = new SupabaseEngineeringIntentSessionStore(client as never);
    const baseRow: Row = {
      project_id: "project-1",
      session_id: "placeholder",
      schema_version: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshot_revision: 1,
      conversation: [],
      interpretation,
      updated_at: "2026-10-13T12:00:00.000Z",
    };
    const corruptions: Array<{ name: string; changes: Partial<Row> }> = [
      { name: "unsupported schema version", changes: { schema_version: 99 } },
      { name: "zero revision", changes: { snapshot_revision: 0 } },
      { name: "negative revision", changes: { snapshot_revision: -1 } },
      { name: "non-integer revision", changes: { snapshot_revision: 1.5 } },
      { name: "malformed timestamp", changes: { updated_at: "not-a-date" } },
      { name: "non-array conversation", changes: { conversation: { role: "engineer", text: "bad" } } },
      { name: "invalid persisted role", changes: { conversation: [{ role: "system", text: "not permitted" }] } },
      { name: "invalid decision status", changes: {
        conversation: [{ role: "assistant", text: "Decision", decision: {
          status: "VERIFIED", validationPassed: true, metrics: [], evidenceIds: [],
        } }],
      } },
      { name: "invalid decision metric", changes: {
        conversation: [{ role: "assistant", text: "Decision", decision: {
          status: "READY", validationPassed: true, metrics: [{ key: "stress", value: Number.NaN }], evidenceIds: [],
        } }],
      } },
      { name: "empty evidence reference", changes: {
        conversation: [{ role: "assistant", text: "Decision", decision: {
          status: "READY", validationPassed: true, metrics: [], evidenceIds: ["  "],
        } }],
      } },
    ];

    for (const [index, corruption] of corruptions.entries()) {
      const sessionId = "corrupt-snapshot-" + index;
      rows.set("project-1::" + sessionId, {
        ...baseRow,
        ...corruption.changes,
        session_id: sessionId,
      });
      await expect(store.get(sessionId, "project-1"), corruption.name).rejects.toThrow(
        "Stored engineering intent session is invalid.",
      );
    }
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

    const updated = await store.get("cas-session", "project-1");
    expect(updated?.snapshotRevision).toBe(2);
    expect(updated?.conversation).toEqual([{ role: "engineer", text: "Design a shaft" }]);

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
