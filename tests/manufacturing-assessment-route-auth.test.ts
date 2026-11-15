import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getUser: vi.fn(),
  readHistory: vi.fn()
}));

vi.mock("../lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } }))
}));
vi.mock("../src/auth/supabase-service", () => ({
  authorizeSupabaseRequest: mocks.authorize
}));
vi.mock("../app/api/manufacturing/services/assessment-service", () => ({
  createManufacturingAssessment: vi.fn(),
  readManufacturingAssessmentHistory: mocks.readHistory
}));

import { GET } from "../app/api/manufacturing/assessments/route";

describe("manufacturing assessment history route session binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      allowed: true,
      subject: "authorized-user",
      reason: "Authorized."
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "different-session-user" } },
      error: null
    });
  });

  it("rejects a session identity that differs from the authorization subject before reading history", async () => {
    const request = new Request(
      "http://localhost/api/manufacturing/assessments?projectId=11111111-1111-4111-8111-111111111111&releaseId=release-001"
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mocks.readHistory).not.toHaveBeenCalled();
  });
});
