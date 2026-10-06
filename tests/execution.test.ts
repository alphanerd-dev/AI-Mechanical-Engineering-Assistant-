import { describe, expect, it } from "vitest";
import { ExecutionEngine, SafeNumericalAdapter, convert } from "../src/execution/index.js";

describe("execution layer", () => {
  it("converts explicit engineering units", () => {
    expect(convert({ value: 1000, unit: "mm" }, "m").value).toBe(1);
    expect(convert({ value: 5, unit: "kW" }, "W").value).toBe(5000);
  });

  it("runs the safe shaft-torque execution path", async () => {
    const engine = new ExecutionEngine([new SafeNumericalAdapter()]);
    const job = await engine.run({
      id: "job-001",
      capability: "ANALYSIS.SHAFT_TORQUE",
      backend: "typescript-safe",
      inputs: { powerKw: 5, speedRpm: 1500 },
      requestedOutputs: ["torqueNm"],
      timeoutMs: 1000,
    });
    expect(job.status).toBe("SUCCEEDED");
    expect(job.result?.torqueNm).toBeCloseTo(31.833, 3);
  });

  it("rejects unsupported backends instead of executing them", async () => {
    const engine = new ExecutionEngine([new SafeNumericalAdapter()]);
    const job = await engine.run({
      id: "job-002",
      capability: "EXECUTE_ARBITRARY_PYTHON",
      backend: "python-worker",
      inputs: { source: "print('unsafe')" },
      requestedOutputs: [],
      timeoutMs: 1000,
    });
    expect(job.status).toBe("FAILED");
  });
});
