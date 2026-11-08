import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  workspaceRead: {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn()
  },
  projectRead: {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn()
  },
  privilegedWrite: {
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn()
  }
}));

vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/server.js", () => ({
  createClient: mocks.createClient
}));
vi.mock("../../lib/supabase/service.js", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient
}));
vi.mock("../../src/auth/supabase-service.js", () => ({
  authorizeSupabaseRequest: mocks.authorize,
  authorizationFailureStatus: (decision: { reason?: string }) =>
    decision.reason === "Durable authorization audit is unavailable." ? 503 : 403
}));

import { POST } from "../app/api/engineering/reasoning/route.js";

const PROJECT_ID = "20000000-0000-4000-8000-000000000001";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("https://workspace.example/api/engineering/reasoning", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "CREATE_TASK",
      projectId: PROJECT_ID,
      name: "Bolted-joint review information",
      goal: "Identify information needed for a generic bolted-joint design review.",
      taskType: "novel-design",
      risk: "MEDIUM",
      uncertainty: "MEDIUM",
      frameworkId: "first-principles",
      frameworkVersion: "1.0.0",
      skillId: "engineering-rd",
      skillVersion: "1.0.0",
      input: {},
      ...overrides
    })
  });
}

describe("engineering reasoning workspace persistence boundary", () => {
  let insertedWorkspace: Record<string, unknown> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    insertedWorkspace = undefined;

    for (const query of [mocks.workspaceRead, mocks.projectRead]) {
      query.select.mockReturnThis();
      query.eq.mockReturnThis();
    }
    mocks.workspaceRead.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.projectRead.maybeSingle.mockResolvedValue({
      data: {
        id: PROJECT_ID,
        name: "Reasoning route integration test",
        stage: "PROBLEM",
        status: "ACTIVE"
      },
      error: null
    });
    mocks.createClient.mockResolvedValue({
      from: (table: string) => table === "engineering_workspaces"
        ? mocks.workspaceRead
        : mocks.projectRead
    });

    mocks.privilegedWrite.insert.mockImplementation((value: Record<string, unknown>) => {
      insertedWorkspace = value;
      return mocks.privilegedWrite;
    });
    mocks.privilegedWrite.update.mockReturnThis();
    mocks.privilegedWrite.eq.mockReturnThis();
    mocks.privilegedWrite.select.mockReturnThis();
    mocks.privilegedWrite.maybeSingle.mockImplementation(async () => ({
      data: insertedWorkspace
        ? {
            revision: insertedWorkspace.revision,
            snapshot: insertedWorkspace.snapshot
          }
        : null,
      error: null
    }));
    mocks.createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => mocks.privilegedWrite)
    });
    mocks.authorize.mockResolvedValue({
      allowed: true,
      subject: "verified-engineering-user",
      reason: "Authorized."
    });
  });

  it("writes durable reasoning snapshots through the server-only client after authorization", async () => {
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith("PROJECT.WRITE", PROJECT_ID);
    expect(mocks.createServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(mocks.privilegedWrite.insert).toHaveBeenCalledTimes(1);
    expect(payload.task).toMatchObject({
      risk: "MEDIUM",
      status: "PROPOSED",
      approvalRequired: true,
      reasoning: {
        skillManifest: {
          id: "engineering-rd",
          version: "1.0.0",
          maximumRisk: "MEDIUM",
          requiresApproval: true
        }
      }
    });
    expect(payload.task.approvalGranted).toBeUndefined();
    expect(payload.task.reasoning.records).toEqual([]);
    expect(payload.persisted).toBe(true);
  });

  it("rejects a task above the selected skill risk ceiling before privileged persistence", async () => {
    const response = await POST(request({ risk: "HIGH" }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toMatch(/maximum risk/);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.privilegedWrite.insert).not.toHaveBeenCalled();
  });

  it("does not create a privileged writer when project authorization is denied", async () => {
    mocks.authorize.mockResolvedValueOnce({
      allowed: false,
      reason: "Project membership is required to access this resource."
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.privilegedWrite.insert).not.toHaveBeenCalled();
  });
});
