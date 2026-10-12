import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../lib/supabase/server.js";
import { authorizeSupabaseRequest } from "../src/auth/supabase-service.js";

vi.mock("../lib/supabase/server.js", () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);

function configureSupabase(input: {
  userId?: string;
  platformRoles?: string[];
  projectRole?: string | null;
  membershipError?: { code?: string; status?: number } | null;
} = {}) {
  const userId = input.userId ?? "user-a";
  const platformRoles = input.platformRoles ?? ["ENGINEER"];
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: input.projectRole ? { role: input.projectRole } : null,
      error: input.membershipError ?? null,
    }),
  };
  query.eq.mockReturnValue(query);

  const supabase = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: userId, app_metadata: { engineering_roles: platformRoles } } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, app_metadata: { engineering_roles: platformRoles } } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(query),
    }),
  };

  mockCreateClient.mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return { supabase, query };
}

describe("project-scoped Supabase authorization", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  it("allows a request only when the verified user has a current project membership", async () => {
    const { supabase, query } = configureSupabase({ projectRole: "ENGINEER" });

    const decision = await authorizeSupabaseRequest("PROJECT.WRITE", "project-1");

    expect(decision.allowed).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("engineering_project_memberships");
    expect(query.eq).toHaveBeenNthCalledWith(1, "project_id", "project-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "user_id", "user-a");
  });

  it("denies a project ID when the user has a global role but no project membership", async () => {
    configureSupabase({ projectRole: null });

    const decision = await authorizeSupabaseRequest("PROJECT.READ", "another-users-project");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Project membership is required to access this resource.");
  });

  it("enforces the role granted within the project as well as the platform role", async () => {
    configureSupabase({ platformRoles: ["ENGINEER"], projectRole: "REVIEWER" });

    const decision = await authorizeSupabaseRequest("PROJECT.WRITE", "project-1");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("PROJECT.WRITE");
  });

  it("fails closed when the membership query returns a database error", async () => {
    configureSupabase({ projectRole: null, membershipError: { code: "42501", status: 403 } });

    const decision = await authorizeSupabaseRequest("PROJECT.WRITE", "project-1");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Project membership could not be verified.");
  });

  it("does not apply project membership checks to genuinely platform-scoped requests", async () => {
    const { supabase } = configureSupabase();

    const decision = await authorizeSupabaseRequest("PROJECT.WRITE");

    expect(decision.allowed).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does not let project membership elevate a platform role", async () => {
    const { supabase } = configureSupabase({
      platformRoles: ["REVIEWER"],
      projectRole: "ADMIN",
    });

    const decision = await authorizeSupabaseRequest("PROJECT.WRITE", "project-1");

    expect(decision.allowed).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
