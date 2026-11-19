import { describe, expect, it, vi, afterEach } from "vitest";
import { parseDurableExecutionInput } from "../app/api/execution/durable.js";

afterEach(() => vi.unstubAllEnvs());

const base = {
  projectId: "9f2dcb7b-bf1b-49a6-a0d2-9f4ccff1c233",
  capability: "ANALYSIS.SHAFT_TORQUE",
  backend: "typescript-safe",
  inputs: { powerKw: 5, speedRpm: 1500 },
  requestedOutputs: ["torqueNm"]
};

function parse(body: Record<string, unknown>) {
  return parseDurableExecutionInput({
    body,
    idempotencyKey: "execution-key-0001",
    requestId: "request-correlation-0001"
  });
}

describe("durable execution request parser", () => {
  it("accepts ordinary TypeScript-safe requests and preserves JSON-shaped input properties", () => {
    const result = parse({
      ...base,
      inputs: { ok: false, error: "user-data", status: 401, code: "domain-value" }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inputs).toEqual({ ok: false, error: "user-data", status: 401, code: "domain-value" });
      expect(result.value.timeoutMs).toBe(2000);
    }
  });

  it("rejects non-object inputs rather than treating a parser error as input", () => {
    const result = parse({ ...base, inputs: ["not", "an", "object"] });
    expect(result).toMatchObject({ ok: false, status: 400, code: "INVALID_INPUTS" });
  });

  it("rejects oversized JSON input before durable submission", () => {
    const result = parse({ ...base, inputs: { text: "x".repeat(65_000) } });
    expect(result).toMatchObject({ ok: false, status: 413, code: "INPUT_TOO_LARGE" });
  });

  it("rejects missing, malformed and unsupported backend identities", () => {
    expect(parse({ ...base, projectId: "not-a-uuid" })).toMatchObject({ ok: false, code: "PROJECT_ID_REQUIRED" });
    expect(parse({ ...base, backend: "arbitrary-python" })).toMatchObject({ ok: false, code: "UNSUPPORTED_BACKEND" });
    expect(parse({ ...base, capability: "" })).toMatchObject({ ok: false, code: "CAPABILITY_REQUIRED" });
  });

  it("requires the configured isolated worker and validates FEA benchmark inputs", () => {
    vi.stubEnv("CALCULIX_WORKER_URL", "http://127.0.0.1:8090");
    vi.stubEnv("CALCULIX_WORKER_API_TOKEN", "test-worker-token");
    const invalid = parse({
      ...base,
      backend: "fea-worker",
      capability: "ANALYSIS.STATIC_STRUCTURAL",
      inputs: { analysis: "STATIC_STRUCTURAL", benchmark: "arbitrary_mesh" }
    });
    expect(invalid).toMatchObject({ ok: false, status: 422, code: "INVALID_SOLVER_REQUEST" });
    const missingConfig = parse({
      ...base,
      backend: "cfd-worker",
      capability: "ANALYSIS.CFD_LAMINAR_CHANNEL",
      inputs: {}
    });
    expect(missingConfig).toMatchObject({ ok: false, status: 503, code: "WORKER_UNAVAILABLE" });
  });

  it("overrides caller outputs and execution budget for solver backends", () => {
    vi.stubEnv("OPENFOAM_WORKER_URL", "http://127.0.0.1:8091");
    vi.stubEnv("OPENFOAM_WORKER_API_TOKEN", "test-openfoam-token");
    const result = parse({
      ...base,
      backend: "cfd-worker",
      capability: "ANALYSIS.CFD_LAMINAR_CHANNEL",
      inputs: {
        caseId: "laminar-channel-poiseuille-v1",
        meanVelocityMps: 0.2,
        heightM: 0.01,
        depthM: 0.001,
        densityKgM3: 1000,
        kinematicViscosityM2PerS: 1e-5,
        mesh: { cellsVertical: 20 },
        solver: { maxIterations: 2000, residualTolerance: 1e-7, timeoutSeconds: 60 }
      },
      requestedOutputs: ["UNTRUSTED_OUTPUT"]
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.requestedOutputs).toEqual(["VELOCITY_PROFILE", "MASS_FLOW", "RESIDUALS", "ARTIFACTS"]);
      expect(result.value.timeoutMs).toBe(180000);
    }
  });
});
