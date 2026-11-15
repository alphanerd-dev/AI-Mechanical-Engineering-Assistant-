import { describe, expect, it } from "vitest";
import { formatInspectionStatus } from "./fixtures/codescene-agent-smoke";

describe("CodeScene agent smoke fixture", () => {
  it.each([
    ["accepted", "PUMP-01 — ACCEPTED"],
    ["rejected", "PUMP-01 — REJECTED"],
    ["pending", "PUMP-01 — PENDING"],
  ] as const)("formats %s inspection status", (status, expected) => {
    expect(formatInspectionStatus({ assetCode: " pump-01 ", status })).toBe(expected);
  });
});
