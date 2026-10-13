import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createClient } from "../lib/supabase/server.js";
import type { EngineeringIntentInterpretation } from "../src/intent/types.js";
import { SupabaseEngineeringIntentSessionStore } from "../src/intent/supabase-session-store.js";

const interpretation: EngineeringIntentInterpretation = {
  raw: "Design a shaft",
  goal: "design a shaft",
  completionUnit: "shaft",
  extractedInputs: { projectId: "project-a", powerKw: 5 },
  missingInputs: ["speed"],
  confidence: "HIGH",
  ambiguity: "LOW",
  contextUsed: ["powerKw"],
  assumptions: [],
};

function fakeSupabase(row: unknown = null, readError: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: row, error: readError });
  query.upsert.mockResolvedValue({ error: null });
  query.delete.mockReturnValue(query);
  query.delete.mockResolvedValue({ error: null });
  const client = { from: vi.fn().mockReturnValue(query) } as unknown as Awaited<ReturnType<typeof createClient>>;
  return { client, query };
}

describe("SupabaseEngineeringIntentSessionStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads only the requested project and session and maps the persisted row", async () => {
    const updatedAt = "2026-10-13T12:00:00.000Z";
    const { client, query } = fakeSupabase({
      project_id: "project-a",
      session_id: "session-1",
      interpretation,
      updated_at: updatedAt,
    });
    const store = new SupabaseEngineeringIntentSessionStore(client);

    await expect(store.get("session-1", "project-a")).resolves.toEqual({
      sessionId: "session-1",
      projectId: "project-a",
      interpretation,
      updatedAt,
    });
    expect(client.from).toHaveBeenCalledWith("engineering_intent_sessions");
    expect(query.select).toHaveBeenCalledWith("project_id,session_id,interpretation,updated_at");
    expect(query.eq).toHaveBeenNthCalledWith(1, "project_id", "project-a");
    expect(query.eq).toHaveBeenNthCalledWith(2, "session_id", "session-1");
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("upserts using the project/session composite key", async () => {
    const { client, query } = fakeSupabase();
    const store = new SupabaseEngineeringIntentSessionStore(client);
    const session = {
      sessionId: "session-1",
      projectId: "project-a",
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    };

    await expect(store.save(session)).resolves.toBeUndefined();
    expect(query.upsert).toHaveBeenCalledWith({
      project_id: "project-a",
      session_id: "session-1",
      interpretation,
      updated_at: session.updatedAt,
    }, { onConflict: "project_id,session_id" });
  });

  it("deletes only the requested project/session pair", async () => {
    const { client, query } = fakeSupabase();
    const store = new SupabaseEngineeringIntentSessionStore(client);

    await expect(store.delete("session-1", "project-a")).resolves.toBeUndefined();
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenNthCalledWith(1, "project_id", "project-a");
    expect(query.eq).toHaveBeenNthCalledWith(2, "session_id", "session-1");
  });

  it("rejects malformed persisted interpretations instead of trusting database JSON", async () => {
    const { client } = fakeSupabase({
      project_id: "project-a",
      session_id: "session-1",
      interpretation: { raw: "Design a shaft", extractedInputs: [] },
      updated_at: "2026-10-13T12:00:00.000Z",
    });
    const store = new SupabaseEngineeringIntentSessionStore(client);

    await expect(store.get("session-1", "project-a")).rejects.toThrow(/invalid stored engineering intent session/i);
  });

  it("fails closed when Supabase returns a persistence error", async () => {
    const { client, query } = fakeSupabase();
    query.upsert.mockResolvedValue({ error: { code: "XX000" } });
    const store = new SupabaseEngineeringIntentSessionStore(client);

    await expect(store.save({
      sessionId: "session-1",
      projectId: "project-a",
      interpretation,
      updatedAt: "2026-10-13T12:00:00.000Z",
    })).rejects.toThrow(/engineering intent session persistence failed/i);
  });
});
