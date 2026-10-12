import { describe, expect, it } from "vitest";
import { isEngineeringRoleRequiredFailure } from "./http-error-classification";

describe("isEngineeringRoleRequiredFailure", () => {
  it("recognizes an explicit engineering-role authorization failure", () => {
    expect(isEngineeringRoleRequiredFailure(403, "ENGINEERING_ROLE_REQUIRED")).toBe(true);
  });

  it("does not misclassify database ownership denials as role failures", () => {
    expect(isEngineeringRoleRequiredFailure(403, "PROJECT_OWNER_POLICY_DENIED")).toBe(false);
  });

  it("does not classify an unrelated 403 without the expected error code", () => {
    expect(isEngineeringRoleRequiredFailure(403, undefined)).toBe(false);
  });

  it("does not classify an unrelated status as a role failure", () => {
    expect(isEngineeringRoleRequiredFailure(503, "ENGINEERING_ROLE_REQUIRED")).toBe(false);
  });
});
