import { describe, expect, it } from "vitest";
import { identityFromSupabaseClaims } from "../src/auth/supabase-identity.js";
import { authorize, permissionsForRoles } from "../src/auth/policy.js";

const stamp = new Date("2026-10-07T00:00:00.000Z");

describe("V2.0.8 Supabase production authentication boundary", () => {
  it("maps server-controlled app_metadata roles into an engineering identity", () => {
    const identity = identityFromSupabaseClaims({
      sub: "user-1",
      session_id: "session-1",
      auth_time: Math.floor(stamp.getTime() / 1000),
      app_metadata: {
        engineering_roles: ["ENGINEER"],
        engineering_project_ids: ["P-1"],
      },
    }, stamp);

    expect(identity).toEqual({
      subject: "user-1",
      roles: ["ENGINEER"],
      projectIds: ["P-1"],
      sessionId: "session-1",
      authenticatedAt: stamp.toISOString(),
    });
  });

  it("fails closed when no server-controlled engineering role is assigned", () => {
    expect(identityFromSupabaseClaims({
      sub: "user-1",
      app_metadata: { engineering_roles: ["NOT_A_ROLE"] },
    }, stamp)).toBeNull();

    expect(identityFromSupabaseClaims({
      sub: "user-1",
      app_metadata: {},
    }, stamp)).toBeNull();
  });

  it("does not treat user-editable metadata as authorization data", () => {
    const identity = identityFromSupabaseClaims({
      sub: "user-1",
      app_metadata: {},
    }, stamp);

    expect(identity).toBeNull();
  });

  it("preserves the existing deny-by-default engineering policy", () => {
    expect(permissionsForRoles(["ENGINEER"])).toContain("TASK.EXECUTE");

    const identity = {
      subject: "engineer-1",
      roles: ["ENGINEER"] as const,
      projectIds: ["P-1"] as const,
      authenticatedAt: stamp.toISOString(),
    };

    expect(authorize({ identity, permission: "TASK.EXECUTE", projectId: "P-1" }).allowed).toBe(true);
    expect(authorize({ identity, permission: "TASK.EXECUTE", projectId: "P-2" }).allowed).toBe(false);
  });

  it("does not grant execution to AGENT identities", () => {
    const identity = {
      subject: "agent-1",
      roles: ["AGENT"] as const,
      authenticatedAt: stamp.toISOString(),
    };

    expect(authorize({ identity, permission: "TASK.EXECUTE", projectId: "P-1" }).allowed).toBe(false);
  });
});
