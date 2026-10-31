import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createGoogle: vi.fn(),
  googleModel: vi.fn(),
  streamText: vi.fn(),
  toUIMessageStreamResponse: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({ createGoogle: mocks.createGoogle }));
vi.mock("ai", () => ({ streamText: mocks.streamText }));
vi.mock("../src/auth/supabase-service.js", () => ({
  authorizeSupabaseRequest: mocks.authorize,
  authorizationFailureStatus: (decision: { reason?: string }) => decision.reason === "Durable authorization audit is unavailable." ? 503 : 403,
}));

import { POST } from "../app/api/projects/[projectId]/engineering/chat/route.js";

const REGISTERED_PROJECT = "20000000-0000-4000-8000-000000000001";

function request(projectId: string, extraFields: Record<string, unknown> = {}) {
  return new Request(
    "https://workspace.example/api/projects/" + projectId + "/engineering/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", parts: [{ type: "text", text: "Reply with exactly: GEMINI_STREAM_OK" }] }],
        ...extraFields,
      }),
    },
  );
}

describe("POST engineering chat provider and project authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENGINEERING_REASONING_MODEL_URL", "");
    vi.stubEnv("ENGINEERING_REASONING_MODEL_NAME", "test-model");
    vi.stubEnv("ENGINEERING_REASONING_MODEL_API_KEY", "test-gemini-key");
    vi.stubEnv("ENGINEERING_REASONING_MODEL_TIMEOUT_MS", "58000");
    mocks.authorize.mockResolvedValue({ allowed: true, reason: "Authorized." });
    mocks.createGoogle.mockReturnValue(mocks.googleModel);
    mocks.googleModel.mockReturnValue("mock-model");
    mocks.streamText.mockReturnValue({ toUIMessageStreamResponse: mocks.toUIMessageStreamResponse });
    mocks.toUIMessageStreamResponse.mockImplementation(() => new Response("stream started", { status: 200 }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the native Google provider and existing server-side API key without requiring a base URL", async () => {
    const response = await POST(request("demo"), { params: Promise.resolve({ projectId: "demo" }) });
    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith("TASK.EXECUTE", undefined);
    expect(mocks.createGoogle).toHaveBeenCalledWith({ apiKey: "test-gemini-key" });
    expect(mocks.googleModel).toHaveBeenCalledWith("test-model");
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    expect(mocks.streamText.mock.calls[0][0]).toHaveProperty("instructions");
    expect(mocks.streamText.mock.calls[0][0]).toMatchObject({
      model: "mock-model",
      maxRetries: 2,
      streamRetries: 1,
      timeout: { totalMs: 58000, firstChunkMs: 25000, chunkMs: 15000 },
    });
    expect(mocks.toUIMessageStreamResponse).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "cache-control": "no-store", "x-accel-buffering": "no" },
      onError: expect.any(Function),
    }));
  });

  it("rejects every client-controlled provider setting before contacting Gemini", async () => {
    const context = { params: Promise.resolve({ projectId: "demo" }) };
    for (const field of ["system", "tools", "model", "provider"]) {
      const response = await POST(request("demo", { [field]: "client-controlled" }), context);
      expect(response.status, field).toBe(400);
    }
    expect(mocks.createGoogle).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("returns a configuration error when the API key is absent", async () => {
    vi.stubEnv("ENGINEERING_REASONING_MODEL_API_KEY", "");
    const response = await POST(request("demo"), { params: Promise.resolve({ projectId: "demo" }) });
    expect(response.status).toBe(503);
    expect(mocks.createGoogle).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("keeps registered projects on the membership-checked authorization path", async () => {
    const response = await POST(request(REGISTERED_PROJECT), { params: Promise.resolve({ projectId: REGISTERED_PROJECT }) });
    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith("TASK.EXECUTE", REGISTERED_PROJECT);
  });

  it("rejects non-demo, non-UUID project identifiers before authorization", async () => {
    const badProject = "another-users-project";
    const response = await POST(request(badProject), { params: Promise.resolve({ projectId: badProject }) });
    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("rejects a registered project when project membership authorization denies access", async () => {
    mocks.authorize.mockResolvedValueOnce({ allowed: false, reason: "Project membership is required to access this resource." });
    const response = await POST(request(REGISTERED_PROJECT), { params: Promise.resolve({ projectId: REGISTERED_PROJECT }) });
    expect(response.status).toBe(403);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
});
