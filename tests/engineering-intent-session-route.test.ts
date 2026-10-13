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

import { POST } from "../app/api/engineering/intent/route.js";

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
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
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

  it("fails closed without exposing environment details when the session database client is unavailable", async () => {
    mocks.createClient.mockRejectedValue(new Error("sensitive database URL"));
    const response = await POST(request({
      projectId: "project-1",
      sessionId: "session-123",
      rawIntent: "Continue the shaft design",
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Engineering intent session storage is unavailable." });
    expect(mocks.routeInput).not.toHaveBeenCalled();
  });

  it("does not create a session client when authorization is denied", async () => {
    mocks.authorize.mockResolvedValue({ allowed: false, reason: "Project scope denied." });
    const response = await POST(request({
      projectId: "project-1",
      sessionId: "session-123",
      rawIntent: "Continue the shaft design",
    }));

    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
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
