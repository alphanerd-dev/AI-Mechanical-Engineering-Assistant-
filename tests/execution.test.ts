import { describe, expect, it } from "vitest";
import { shaftTorque } from "../src/engineering/calculations.js";
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
    expect(job.provenance?.capability).toBe("ANALYSIS.SHAFT_TORQUE");
    expect(job.provenance?.backend).toBe("typescript-safe");
    expect(job.provenance?.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(job.provenance?.outputDigest).toMatch(/^[a-f0-9]{64}$/);
  });


  it.each([NaN, Infinity, -Infinity, 0, -1])("rejects invalid power input %s", (powerKw) => {
    expect(() => shaftTorque(powerKw, 1500)).toThrow(/powerKw must be a positive finite number/);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])("rejects invalid speed input %s", (speedRpm) => {
    expect(() => shaftTorque(5, speedRpm)).toThrow(/speedRpm must be a positive finite number/);
  });

  it("rejects non-numeric inputs rather than coercing strings", () => {
    expect(() => shaftTorque("5" as unknown as number, 1500)).toThrow(/powerKw must be a positive finite number/);
  });

  it("rejects a mathematically overflowing torque result", () => {
    expect(() => shaftTorque(Number.MAX_VALUE, Number.MIN_VALUE)).toThrow(/finite numeric range/);
  });


  it("fails a malformed shaft-torque request without returning a result", async () => {
    const engine = new ExecutionEngine([new SafeNumericalAdapter()]);
    const job = await engine.run({
      id: "job-invalid-input",
      capability: "ANALYSIS.SHAFT_TORQUE",
      backend: "typescript-safe",
      inputs: { powerKw: "5", speedRpm: 1500 },
      requestedOutputs: ["torqueNm"],
      timeoutMs: 1000,
    });
    expect(job.status).toBe("FAILED");
    expect(job.result).toBeUndefined();
    expect(job.error).toMatch(/powerKw must be a positive finite number/);
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
