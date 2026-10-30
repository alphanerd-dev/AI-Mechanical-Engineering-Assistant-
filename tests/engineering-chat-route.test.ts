import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), createProvider: vi.fn(), chatModel: vi.fn(), streamText: vi.fn(), toUIMessageStreamResponse: vi.fn() }));

vi.mock("@ai-sdk/openai-compatible", () => ({ createOpenAICompatible: mocks.createProvider }));
vi.mock("ai", () => ({ streamText: mocks.streamText }));
vi.mock("../src/auth/supabase-service.js", () => ({
  authorizeSupabaseRequest: mocks.authorize,
  authorizationFailureStatus: (decision: { reason?: string }) => decision.reason === "Durable authorization audit is unavailable." ? 503 : 403,
}));

import { POST } from "../app/api/projects/[projectId]/engineering/chat/route.js";

const REGISTERED_PROJECT = "20000000-0000-4000-8000-000000000001";

function request(projectId: string) {
  return new Request(`https://workspace.example/api/projects/${projectId}/engineering/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "Reply with exactly: GEMINI_STREAM_OK" }] }] }),
  });
}

describe("POST engineering chat project authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENGINEERING_REASONING_MODEL_URL", "https://model.example/v1");
    vi.stubEnv("ENGINEERING_REASONING_MODEL_NAME", "test-model");
    vi.stubEnv("ENGINEERING_REASONING_MODEL_TIMEOUT_MS", "45000");
    mocks.authorize.mockResolvedValue({ allowed: true, reason: "Authorized." });
    mocks.createProvider.mockReturnValue({ chatModel: mocks.chatModel });
    mocks.chatModel.mockReturnValue("mock-model");
    mocks.streamText.mockReturnValue({ toUIMessageStreamResponse: mocks.toUIMessageStreamResponse });
    mocks.toUIMessageStreamResponse.mockImplementation(() => new Response("stream started", { status: 200 }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("supports the explicit demo sandbox without sending demo to the UUID membership query", async () => {
    const response = await POST(request("demo"), { params: Promise.resolve({ projectId: "demo" }) });
    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith("TASK.EXECUTE", undefined);
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    expect(mocks.streamText.mock.calls[0][0]).toHaveProperty("instructions");
    expect(mocks.streamText.mock.calls[0][0]).toMatchObject({ maxRetries: 2, streamRetries: 2 });
    expect(mocks.toUIMessageStreamResponse).toHaveBeenCalledWith(expect.objectContaining({ headers: { "cache-control": "no-store", "x-accel-buffering": "no" }, onError: expect.any(Function) }));
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