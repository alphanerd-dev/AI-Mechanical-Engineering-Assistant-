import { describe, expect, it, vi } from "vitest";
import type { ExecutionRequest, ExecutionResult } from "../src/execution/types.js";
import type { ExecutionWorkerClient } from "../src/execution/calculix-benchmark-worker.js";
import { OpenFOAMLaminarChannelWorkerAdapter } from "../src/execution/openfoam14-worker.js";
import type { OpenFOAMLaminarChannelRequest, OpenFOAMLaminarChannelResult } from "../src/cfd/types.js";

const input: OpenFOAMLaminarChannelRequest = {
  caseId: "laminar-channel-poiseuille-v1",
  meanVelocityMps: 0.2,
  heightM: 0.01,
  depthM: 0.001,
  densityKgM3: 1000,
  kinematicViscosityM2PerS: 1e-5,
  mesh: { cellsVertical: 20 },
  solver: { maxIterations: 2000, residualTolerance: 1e-7, timeoutSeconds: 5 }
};

function result(): OpenFOAMLaminarChannelResult {
  const velocityProfile = Array.from({ length: 20 }, (_, index) => {
    const yM = (index + 0.5) * (input.heightM / 2) / 20;
    const ratio = yM / input.heightM;
    return { yM, axialVelocityMps: 6 * input.meanVelocityMps * ratio * (1 - ratio) };
  });
  return {
    jobId: "9f2dcb7b-bf1b-49a6-a0d2-9f4ccff1c233",
    status: "COMPLETED",
    solver: "OpenFOAM",
    solverVersion: "14",
    converged: true,
    meshCells: 20,
    massFluxKgS: 0.002,
    residuals: { pressure: 1e-8, velocity: 1e-8 },
    velocityProfile,
    artifacts: [
      { kind: "MESH", path: "mesh/blockMeshDict", mediaType: "text/plain", sha256: "a".repeat(64) },
      { kind: "VELOCITY_FIELD", path: "fields/U", mediaType: "text/plain", sha256: "b".repeat(64) },
      { kind: "PRESSURE_FIELD", path: "fields/p", mediaType: "text/plain", sha256: "c".repeat(64) },
      { kind: "SOLVER_LOG", path: "logs/solver.log", mediaType: "text/plain", sha256: "d".repeat(64) }
    ],
    warnings: []
  };
}

function workerResult(cfdResult: OpenFOAMLaminarChannelResult, success = true): ExecutionResult {
  return {
    success,
    outputs: { cfdResult },
    warnings: [],
    artifactIds: [],
    provider: "openfoam14",
    providerVersion: "14"
  };
}

function makeClient(response: ExecutionResult): ExecutionWorkerClient {
  return { run: vi.fn(async () => response) };
}

function request(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    id: "9f2dcb7b-bf1b-49a6-a0d2-9f4ccff1c233",
    capability: "ANALYSIS.CFD_LAMINAR_CHANNEL",
    backend: "cfd-worker",
    inputs: input as unknown as Record<string, unknown>,
    requestedOutputs: ["VELOCITY_PROFILE", "MASS_FLOW", "RESIDUALS", "ARTIFACTS"],
    timeoutMs: 125000,
    ...overrides
  };
}

describe("OpenFOAM 14 durable execution adapter", () => {
  it("validates successful solver output against the analytical Poiseuille solution", async () => {
    const client = makeClient(workerResult(result()));
    const adapter = new OpenFOAMLaminarChannelWorkerAdapter(client);
    expect(adapter.canExecute(request())).toBe(true);
    const execution = await adapter.execute(request());
    expect(execution.success).toBe(true);
    expect(execution.provider).toBe("openfoam14");
    expect(execution.outputs.validation).toMatchObject({ status: "PASS" });
    expect(client.run).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong execution routes without dispatching", async () => {
    const client = makeClient(workerResult(result()));
    const adapter = new OpenFOAMLaminarChannelWorkerAdapter(client);
    expect(adapter.canExecute(request({ backend: "fea-worker" }))).toBe(false);
    expect(adapter.canExecute(request({ capability: "CODE.EXECUTE" }))).toBe(false);
    expect(client.run).not.toHaveBeenCalled();
  });

  it("rejects invalid benchmark inputs before dispatching", async () => {
    const client = makeClient(workerResult(result()));
    const adapter = new OpenFOAMLaminarChannelWorkerAdapter(client);
    const invalid = { ...input, meanVelocityMps: 200 };
    const execution = await adapter.execute(request({ inputs: invalid as unknown as Record<string, unknown> }));
    expect(execution.success).toBe(false);
    expect(execution.warnings.join(" ")).toContain("meanVelocityMps");
    expect(client.run).not.toHaveBeenCalled();
  });

  it("does not convert failed solver completion into a passing CFD result", async () => {
    const failed = result();
    failed.status = "FAILED";
    failed.converged = false;
    const adapter = new OpenFOAMLaminarChannelWorkerAdapter(makeClient(workerResult(failed, false)));
    const execution = await adapter.execute(request());
    expect(execution.success).toBe(false);
    expect(execution.outputs.validation).toMatchObject({ status: "FAIL" });
  });

  it("fails closed when the worker omits its typed CFD result", async () => {
    const adapter = new OpenFOAMLaminarChannelWorkerAdapter(makeClient({
      success: true, outputs: {}, warnings: [], artifactIds: []
    }));
    const execution = await adapter.execute(request());
    expect(execution.success).toBe(false);
    expect(execution.warnings.join(" ")).toContain("no normalized CFD result");
  });
});
