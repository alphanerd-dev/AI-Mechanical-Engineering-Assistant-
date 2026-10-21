import { describe, expect, it } from "vitest";
import { summarizeOutcomeBaseline } from "../scripts/outcome-baseline.mjs";

const observedCost = (compute, provider) => ({
  currency: "USD", compute, provider, infrastructure: 0, license: 0,
});

const trials = [
  {
    taskRef: "task-a", cohort: "baseline", accepted: true,
    startedAt: "2026-10-20T10:00:00Z", acceptedAt: "2026-10-20T10:30:00Z",
    engineerActiveMinutes: 12, cost: observedCost(0.1, 0.2),
    failedAttempts: 1, recoveredAfterFailure: true, repeatUseWithin7Days: true,
    validationRequired: true, evidenceComplete: true,
  },
  {
    taskRef: "task-b", cohort: "workspace", accepted: true,
    startedAt: "2026-10-20T11:00:00Z", acceptedAt: "2026-10-20T11:40:00Z",
    engineerActiveMinutes: 20, cost: observedCost(0.2, 0.3),
    failedAttempts: 0, recoveredAfterFailure: null, repeatUseWithin7Days: null,
    validationRequired: true, evidenceComplete: false,
  },
  {
    taskRef: "task-c", cohort: "workspace", accepted: false,
    startedAt: "2026-10-20T12:00:00Z", acceptedAt: null,
    engineerActiveMinutes: 15, cost: null,
    failedAttempts: 1, recoveredAfterFailure: false, repeatUseWithin7Days: false,
    validationRequired: true, evidenceComplete: null,
  },
];

describe("outcome baseline", () => {
  it("computes accepted-result, effort and observed cost metrics without guessing", () => {
    const result = summarizeOutcomeBaseline(trials);
    expect(result.acceptanceRate).toBeCloseTo(2 / 3);
    expect(result.timeToAcceptedResultMinutes.median).toBe(35);
    expect(result.activeEngineerMinutes.median).toBe(15);
    expect(result.observedCost.status).toBe("MEASURED");
    expect(result.observedCost.costPerAcceptedOutcome).toBeCloseTo(0.4);
    expect(result.observedCost.acceptedCostCoverage).toBe(1);
    expect(result.cohorts.baseline.taskCount).toBe(1);
    expect(result.cohorts.workspace.acceptedCount).toBe(1);
  });

  it("reports evidence, recovery and repeat-use coverage independently", () => {
    const result = summarizeOutcomeBaseline(trials);
    expect(result.applicableValidationEvidence.completeRateAmongObserved).toBe(0.5);
    expect(result.recoveryAfterFailure.recoveryRateAmongObserved).toBe(0.5);
    expect(result.repeatUseWithin7Days.repeatRateAmongObserved).toBe(0.5);
    expect(result.repeatUseWithin7Days.measurementCoverage).toBeCloseTo(2 / 3);
  });

  it("keeps incomplete costs and accepted-result times unmeasured", () => {
    const result = summarizeOutcomeBaseline([
      {...trials[0], cost: {...observedCost(0.1, 0.2), license: null}},
      {...trials[1], cost: null},
    ]);
    expect(result.observedCost.costPerAcceptedOutcome).toBeNull();
    expect(result.observedCost.status).toBe("INCOMPLETE_COST_COMPONENTS");
    expect(result.observedCost.acceptedCostCoverage).toBe(0);
  });

  it("does not aggregate mixed currencies or accept identifying task references", () => {
    const mixed = [{...trials[0], cost: {...observedCost(1, 1), currency:"NGN"}}, trials[1]];
    expect(summarizeOutcomeBaseline(mixed).observedCost.status).toBe("NOT_AGGREGATED_MIXED_CURRENCY");
    expect(() => summarizeOutcomeBaseline([{...trials[0], taskRef:"someone@example.com"}])).toThrow(/non-identifying/);
  });
});
