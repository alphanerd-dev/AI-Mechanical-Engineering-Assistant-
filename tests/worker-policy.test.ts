import { describe, expect, it } from "vitest";
import { PYTHON_NUMERICAL_WORKER_POLICY, validateWorkerRequest } from "../src/execution/worker-policy.js";

describe("worker policy", () => {
  it("allows approved numerical capabilities within timeout", () => {
    expect(validateWorkerRequest(PYTHON_NUMERICAL_WORKER_POLICY, "ANALYSIS.SHAFT_TORQUE", 5000)).toEqual([]);
  });
  it("blocks unknown capabilities and excessive timeouts", () => {
    expect(validateWorkerRequest(PYTHON_NUMERICAL_WORKER_POLICY, "EXECUTE_ARBITRARY_PYTHON", 60000)).toHaveLength(2);
  });
});
