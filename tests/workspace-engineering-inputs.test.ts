import { describe, expect, it } from "vitest";
import {
  assessRequirementCompleteness,
  calculateShaftTorque,
  normalizeRequirements,
  normalizeTextList
} from "../src/workspace/engineering-inputs.js";

describe("persistent engineering inputs", () => {
  it("calculates torque from power and rotational speed with SI unit handling", () => {
    const result = calculateShaftTorque(5, 1500);
    expect(result.angularVelocityRadPerSecond).toBeCloseTo(157.079633, 6);
    expect(result.torqueNm).toBeCloseTo(31.830989, 6);
    expect(result.informationStatus).toBe("CALCULATED");
  });

  it("rejects zero, negative and non-finite torque inputs", () => {
    expect(() => calculateShaftTorque(0, 1500)).toThrow(/Power must be/);
    expect(() => calculateShaftTorque(5, -1)).toThrow(/Rotational speed must be/);
    expect(() => calculateShaftTorque(Number.NaN, 1500)).toThrow(/Power must be/);
    expect(() => calculateShaftTorque(1_000_001, 1500)).toThrow(/Power must be/);
  });

  it("forces new client-submitted requirements back to OPEN until evidence is recorded", () => {
    const result = normalizeRequirements([{
      id: "REQ-1",
      name: "Shaft yield criterion",
      value: 120,
      unit: "MPa",
      priority: "MUST",
      verificationMethod: "Compare verified stress result with allowable stress",
      status: "SATISFIED"
    }]);
    expect(result[0].status).toBe("OPEN");
    expect(result[0].verificationMethod).toContain("verified stress");
  });

  it("rejects duplicate requirement identifiers and oversized registers", () => {
    const item = { id: "REQ-1", name: "Power", priority: "MUST" };
    expect(() => normalizeRequirements([item, item])).toThrow(/Duplicate requirement ID/);
    expect(() => normalizeRequirements(Array.from({ length: 101 }, (_, index) => ({
      id: `REQ-${index}`, name: `Requirement ${index}`, priority: "MUST"
    })))).toThrow(/at most 100/);
  });

  it("blocks empty or incomplete MUST registers and requires evidence for populated ones", () => {
    expect(assessRequirementCompleteness([]).status).toBe("BLOCKED");
    const incomplete = normalizeRequirements([{ id: "REQ-1", name: "Power", priority: "MUST" }]);
    expect(assessRequirementCompleteness(incomplete).status).toBe("BLOCKED");
    const populated = normalizeRequirements([{
      id: "REQ-1", name: "Power", value: 5, unit: "kW",
      priority: "MUST", verificationMethod: "Read from nameplate"
    }]);
    const result = assessRequirementCompleteness(populated);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.awaitingEvidence).toHaveLength(1);
  });

  it("normalizes bounded textual lists and rejects empty entries", () => {
    expect(normalizeTextList(["  thermal growth  "], "Assumptions")).toEqual(["thermal growth"]);
    expect(() => normalizeTextList([" "], "Assumptions")).toThrow(/entry 1/);
  });
});
