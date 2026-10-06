import { describe, expect, it } from "vitest";
import { evaluateEngineeringAcceptance } from "../src/simulation/engineering-acceptance.js";

const result = { converged: true, maxStressMpa: 100, maxDisplacementMm: 0.2, warnings: [] };

describe("engineering simulation acceptance", () => {
  it("accepts when all configured gates pass", () => {
    const decision = evaluateEngineeringAcceptance({
      result,
      validation: { pass: true, checks: [] },
      yieldStrengthMpa: 250,
      minimumFactorOfSafety: 2,
      coarseResult: { ...result, maxStressMpa: 103 },
      maximumRelativeStressChange: 0.05
    });
    expect(decision.status).toBe("ACCEPTED");
    expect(decision.accepted).toBe(true);
  });

  it("rejects failed factor of safety", () => {
    const decision = evaluateEngineeringAcceptance({
      result: { ...result, maxStressMpa: 140 },
      validation: { pass: true, checks: [] },
      yieldStrengthMpa: 250,
      minimumFactorOfSafety: 2
    });
    expect(decision.status).toBe("REJECTED");
    expect(decision.blockingReasons).toContain("Required factor of safety was not achieved.");
  });

  it("reports incomplete convergence evidence when required", () => {
    const decision = evaluateEngineeringAcceptance({
      result,
      validation: { pass: true, checks: [] },
      yieldStrengthMpa: 250,
      minimumFactorOfSafety: 2,
      maximumRelativeStressChange: 0.05
    });
    expect(decision.status).toBe("INCOMPLETE");
    expect(decision.accepted).toBe(false);
  });
});
