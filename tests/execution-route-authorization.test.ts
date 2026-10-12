import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  run: vi.fn(),
  constructEngine: vi.fn(),
}));

vi.mock("../src/auth/supabase-service.js", () => ({
  authorizeSupabaseRequest: mocks.authorize,
}));
vi.mock("../src/execution/executor.js", () => ({
  ExecutionEngine: class {
    constructor(adapters: unknown[]) {
      mocks.constructEngine(adapters);
    }
    run(request: unknown) {
      return mocks.run(request);
    }
  },
}));
vi.mock("../src/execution/safe-numerical.js", () => ({
  SafeNumericalAdapter: class {},
}));
vi.mock("../src/execution/python-worker.js", () => ({
  PythonWorkerAdapter: class {},
}));
vi.mock("../src/execution/http-python-worker.js", () => ({
  HttpPythonWorkerClient: class {},
}));

import { POST } from "../app/api/execution/route.js";

function request(body: unknown) {
  return new Request("http://localhost/api/execution", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/execution authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allowed: true, reason: "Authorized." });
    mocks.run.mockResolvedValue({ id: "job-1", status: "SUCCEEDED" });
  });

  it("requires TASK.EXECUTE and project membership when a project is supplied", async () => {
    const response = await POST(request({
      projectId: "project-1",
      capability: "ANALYSIS.SHAFT_TORQUE",
      backend: "typescript-safe",
      inputs: { powerKw: 5, speedRpm: 1500 },
    }));

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith("TASK.EXECUTE", "project-1");
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it("does not construct or run an execution engine when permission is denied", async () => {
    mocks.authorize.mockResolvedValue({
      allowed: false,
      reason: "Permission denied: TASK.EXECUTE.",
    });

    const response = await POST(request({ capability: "ANALYSIS.SHAFT_TORQUE" }));

    expect(response.status).toBe(403);
    expect(mocks.constructEngine).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("fails closed when authorization infrastructure throws", async () => {
    mocks.authorize.mockRejectedValue(new Error("Supabase unavailable"));

    const response = await POST(request({ capability: "ANALYSIS.SHAFT_TORQUE" }));

    expect(response.status).toBe(503);
    expect(mocks.constructEngine).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects an explicitly supplied empty project ID instead of treating it as platform-scoped", async () => {
    const response = await POST(request({ projectId: "   ", capability: "ANALYSIS.SHAFT_TORQUE" }));

    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
