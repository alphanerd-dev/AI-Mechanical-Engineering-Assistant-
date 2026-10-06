import { describe, expect, it } from "vitest";
import { ExecutionEngine } from "../src/execution/index.js";
import { PythonWorkerAdapter, PythonWorkerClient } from "../src/execution/python-worker.js";
import { ExecutionResult } from "../src/execution/types.js";

class FakePythonWorker implements PythonWorkerClient {
  async run(request: any): Promise<ExecutionResult> {
    return {
      success: true,
      outputs: {
        torqueNm: 9550 * Number(request.inputs.powerKw) / Number(request.inputs.speedRpm),
        engine: "python-worker"
      },
      warnings: [],
      artifactIds: []
    };
  }
}

describe("controlled Python worker boundary", () => {
  it("routes an allowlisted numerical capability to the Python worker", async () => {
    const engine = new ExecutionEngine([new PythonWorkerAdapter(new FakePythonWorker())]);
    const job = await engine.run({
      id: "py-job-001",
      capability: "ANALYSIS.SHAFT_TORQUE",
      backend: "python-worker",
      inputs: { powerKw: 5, speedRpm: 1500 },
      requestedOutputs: ["torqueNm"],
      timeoutMs: 1000
    });
    expect(job.status).toBe("SUCCEEDED");
    expect(job.result?.torqueNm).toBeCloseTo(31.833, 3);
    expect(job.result?.engine).toBe("python-worker");
  });

  it("does not allow arbitrary Python execution", () => {
    const adapter = new PythonWorkerAdapter(new FakePythonWorker());
    expect(adapter.canExecute({
      id: "blocked",
      capability: "EXECUTE_ARBITRARY_PYTHON",
      backend: "python-worker",
      inputs: { source: "print('unsafe')" },
      requestedOutputs: [],
      timeoutMs: 1000
    })).toBe(false);
  });
});
