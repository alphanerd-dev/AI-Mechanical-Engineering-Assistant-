import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  routeInput: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("../lib/supabase/server.js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("../src/auth/supabase-service.js", () => ({
  authorizeSupabaseRequest: mocks.authorize,
  authorizationFailureStatus: (decision: { reason?: string }) => decision.reason === "Durable authorization audit is unavailable." ? 503 : 403,
}));
vi.mock("../src/capabilities/registry.js", () => ({
  CapabilityRegistry: class {
    registerCatalog() {}
    register() {}
  },
}));
vi.mock("../src/capabilities/router.js", () => ({
  CapabilityRouter: class {
    execute(input: unknown) {
      mocks.routeInput(input);
      return Promise.resolve({ success: true, output: { status: "NEEDS_INPUT" } });
    }
  },
}));

import { GET, POST } from "../app/api/engineering/intent/route.js";

function request(body: unknown) {
  return new Request("http://localhost/api/engineering/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/engineering/intent session continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allowed: true, reason: "Authorized." });
    mocks.createClient.mockResolvedValue({});
  });

  it("forwards the validated session ID into the capability request", async () => {
    const response = await POST(request({
      projectId: "project-1",
      sessionId: "session-123",
      rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm",
    }));

    expect(response.status).toBe(200);
    expect(mocks.routeInput).toHaveBeenCalledTimes(1);
    expect(mocks.routeInput.mock.calls[0][0]).toMatchObject({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      input: {
        projectId: "project-1",
        sessionId: "session-123",
        rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm",
      },
    });
  });

  it("rejects malformed session IDs rather than silently dropping session continuity", async () => {
    const response = await POST(request({
      projectId: "project-1",
      sessionId: "   ",
      rawIntent: "Continue the shaft design",
    }));

    expect(response.status).toBe(400);
    expect(mocks.routeInput).not.toHaveBeenCalled();
  });

  it("returns a controlled 503 when the request-scoped session client cannot be created", async () => {
    mocks.createClient.mockRejectedValueOnce(new Error("database configuration unavailable"));

    const response = await POST(request({
      projectId: "project-1",
      sessionId: "session-123",
      rawIntent: "Continue the shaft design",
    }));

    expect(response.status).toBe(503);
    expect(mocks.routeInput).not.toHaveBeenCalled();
  });

  it("keeps session ID optional for clients that do not use multi-turn sessions", async () => {
    const response = await POST(request({
      projectId: "project-1",
      rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm",
    }));

    expect(response.status).toBe(200);
    expect(mocks.routeInput.mock.calls[0][0]).toMatchObject({
      input: { projectId: "project-1", sessionId: undefined },
    });
  });
});


describe("GET /api/engineering/intent latest chat restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allowed: true, reason: "Authorized." });
  });

  function restoreRequest(query: string) {
    return new Request("http://localhost/api/engineering/intent?" + query, {
      method: "GET",
      headers: { accept: "application/json" },
    });
  }

  it("returns only the latest project-scoped engineering chat session", async () => {
    const row = {
      project_id: "project-1",
      session_id: "engineering-chat-session-123",
      interpretation: {
        raw: "",
        goal: "engineering task",
        extractedInputs: {},
        missingInputs: [],
        confidence: "LOW",
        ambiguity: "HIGH",
        contextUsed: [],
        assumptions: [],
      },
      conversation: [
        { role: "engineer", text: "Design a shaft." },
        { role: "assistant", text: "What bending moment should be used?" },
      ],
      schema_version: 1,
      snapshot_revision: 5,
      updated_at: "2026-10-31T17:54:21.292Z",
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    const from = vi.fn().mockReturnValue(query);
    mocks.createClient.mockResolvedValue({ from });

    const response = await GET(restoreRequest("projectId=project-1&latest=chat"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sessionId: "engineering-chat-session-123",
      projectId: "project-1",
      snapshotRevision: 5,
      conversation: row.conversation,
      restored: true,
    });
    expect(mocks.authorize).toHaveBeenCalledWith("PROJECT.READ", "project-1");
    expect(from).toHaveBeenCalledWith("engineering_intent_sessions");
    expect(query.like).toHaveBeenCalledWith("session_id", "engineering-chat-%");
    expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("returns 404 rather than creating a session when no saved chat exists", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });

    const response = await GET(restoreRequest("projectId=project-1&latest=chat"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ code: "CHAT_SESSION_NOT_FOUND", recoverable: true });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("rejects unsupported latest selectors", async () => {
    const response = await GET(restoreRequest("projectId=project-1&latest=anything"));
    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
