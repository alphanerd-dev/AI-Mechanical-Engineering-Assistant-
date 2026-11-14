import { describe, expect, it } from "vitest";
import {
  getSafeAuthCallbackDestination,
  isSupportedAuthCallbackOtpType,
  MINIMUM_PASSWORD_LENGTH,
  validatePasswordUpdate,
} from "../src/auth/password-recovery.js";

describe("password recovery validation", () => {
  it("requires both password fields", () => {
    expect(validatePasswordUpdate("", "")).toEqual({
      ok: false,
      reason: "missing-fields",
    });
    expect(validatePasswordUpdate("valid-password-123", null)).toEqual({
      ok: false,
      reason: "missing-fields",
    });
  });

  it("enforces the same ten-character minimum as account registration", () => {
    expect(MINIMUM_PASSWORD_LENGTH).toBe(10);
    expect(validatePasswordUpdate("short", "short")).toEqual({
      ok: false,
      reason: "password-policy",
    });
  });

  it("rejects mismatched passwords", () => {
    expect(validatePasswordUpdate("long-enough-password", "different-password")).toEqual({
      ok: false,
      reason: "password-mismatch",
    });
  });

  it("accepts a matching password meeting the policy", () => {
    expect(validatePasswordUpdate("long-enough-password", "long-enough-password")).toEqual({
      ok: true,
      password: "long-enough-password",
    });
  });
});

describe("authentication callback redirect allowlist", () => {
  it("allows only the first-party password recovery and email confirmation destinations", () => {
    expect(getSafeAuthCallbackDestination("/update-password")).toBe("/update-password");
    expect(getSafeAuthCallbackDestination("/login?confirmed=1")).toBe("/login?confirmed=1");
  });

  it("falls back to login for external, protocol-relative, and unknown destinations", () => {
    expect(getSafeAuthCallbackDestination("https://attacker.example")).toBe("/login");
    expect(getSafeAuthCallbackDestination("//attacker.example")).toBe("/login");
    expect(getSafeAuthCallbackDestination("/admin")).toBe("/login");
    expect(getSafeAuthCallbackDestination(null)).toBe("/login");
  });

  it("accepts only the signup and password-recovery OTP types", () => {
    expect(isSupportedAuthCallbackOtpType("signup")).toBe(true);
    expect(isSupportedAuthCallbackOtpType("recovery")).toBe(true);
    expect(isSupportedAuthCallbackOtpType("invite")).toBe(false);
    expect(isSupportedAuthCallbackOtpType("email_change")).toBe(false);
    expect(isSupportedAuthCallbackOtpType(null)).toBe(false);
  });
});
