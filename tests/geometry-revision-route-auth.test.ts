import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getUser: vi.fn(),
  createServiceRoleClient: vi.fn()
}));

vi.mock("../lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } }))
}));
vi.mock("../src/auth/supabase-service", () => ({
  authorizeSupabaseRequest: mocks.authorize
}));
vi.mock("../lib/supabase/service", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient
}));

import { GET } from "../app/api/cad/geometry/revisions/route";

describe("geometry revision history route session binding", () => {
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

  it("rejects a session identity that differs from the authorization subject before privileged reads", async () => {
    const request = new Request(
      "http://localhost/api/cad/geometry/revisions?projectId=11111111-1111-4111-8111-111111111111&modelIdentityId=22222222-2222-4222-8222-222222222222"
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });
});
