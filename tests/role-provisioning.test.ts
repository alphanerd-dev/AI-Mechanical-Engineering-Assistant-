import { describe, expect, it } from "vitest";
import { provisionRoleForAuthenticatedUser } from "../src/auth/role-provisioning";

describe("provisionRoleForAuthenticatedUser", () => {
  it("grants baseline ENGINEER to a signed-in user with no engineering role", () => {
    expect(provisionRoleForAuthenticatedUser({ userId: "user-1", existingRoles: undefined })).toBe("ENGINEER");
  });

  it("does not overwrite an existing approved role", () => {
    expect(provisionRoleForAuthenticatedUser({ userId: "user-1", existingRoles: ["REVIEWER"] })).toBeNull();
    expect(provisionRoleForAuthenticatedUser({ userId: "user-1", existingRoles: "ENGINEER" })).toBeNull();
  });

  it("grants ADMIN only to the exact server-configured bootstrap user", () => {
    expect(provisionRoleForAuthenticatedUser({
      userId: "bootstrap-user",
      existingRoles: [],
      bootstrapAdminUserId: "bootstrap-user",
    })).toBe("ADMIN");
    expect(provisionRoleForAuthenticatedUser({
      userId: "ordinary-user",
      existingRoles: [],
      bootstrapAdminUserId: "bootstrap-user",
    })).toBe("ENGINEER");
  });

  it("does not treat a blank bootstrap setting as an administrator identity", () => {
    expect(provisionRoleForAuthenticatedUser({
      userId: "ordinary-user",
      existingRoles: [],
      bootstrapAdminUserId: " ",
    })).toBe("ENGINEER");
  });

  it("reprovisions an explicitly configured bootstrap account to ADMIN", () => {
    expect(provisionRoleForAuthenticatedUser({
      userId: "bootstrap-user",
      existingRoles: ["ENGINEER"],
      bootstrapAdminUserId: "bootstrap-user",
    })).toBe("ADMIN");
  });
});
