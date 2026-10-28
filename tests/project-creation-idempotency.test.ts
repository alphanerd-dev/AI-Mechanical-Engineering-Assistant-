import { describe, expect, it } from "vitest";
import {
  hashProjectCreationPayload,
  parseProjectCreationIdempotencyKey
} from "../src/projects/creation-idempotency.js";

describe("project creation idempotency contract", () => {
  it("supports legacy callers that do not send an idempotency key", () => {
    expect(parseProjectCreationIdempotencyKey(null)).toBeUndefined();
  });

  it("trims a supplied key and accepts the bounded safe character set", () => {
    expect(parseProjectCreationIdempotencyKey("  request-1.a_b:c  ")).toBe("request-1.a_b:c");
    expect(parseProjectCreationIdempotencyKey("x".repeat(128))).toHaveLength(128);
  });

  it("rejects empty, oversized, or ambiguous keys", () => {
    for (const value of ["", "   ", "key with spaces", "key/with/slash", "x".repeat(129)]) {
      expect(() => parseProjectCreationIdempotencyKey(value)).toThrow(/Idempotency-Key/);
    }
  });

  it("hashes the exact normalized project payload deterministically", () => {
    const first = hashProjectCreationPayload("Pump station", "Estimate shaft power.");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(hashProjectCreationPayload("Pump station", "Estimate shaft power.")).toBe(first);
    expect(hashProjectCreationPayload("Pump station 2", "Estimate shaft power.")).not.toBe(first);
    expect(hashProjectCreationPayload("Pump station", "Estimate motor power.")).not.toBe(first);
  });
});
