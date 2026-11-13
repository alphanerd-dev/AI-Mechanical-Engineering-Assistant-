import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityRouter } from "../src/capabilities/router.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { V1_25_CAPABILITIES } from "../src/capabilities/v1-25.js";
import {
  OPENFOAM_LAMINAR_CHANNEL_CASE_ID,
  OpenFOAMLaminarChannelRequest,
  OpenFOAMLaminarChannelResult
} from "../src/cfd/types.js";
import {
  expectedPoiseuillePressureDropPa,
  poiseuilleAxialVelocity,
  validateOpenFOAMLaminarChannelRequest,
  validateOpenFOAMLaminarChannelResult
} from "../src/cfd/validation.js";
import { OpenFOAMProvider } from "../src/providers/openfoam.js";

const request: OpenFOAMLaminarChannelRequest = {
  caseId: OPENFOAM_LAMINAR_CHANNEL_CASE_ID,
  meanVelocityMps: 0.2,
  heightM: 0.01,
  lengthM: 0.2,
  depthM: 0.001,
  densityKgM3: 1000,
  kinematicViscosityM2PerS: 1e-5,
  mesh: { cellsAxial: 400, cellsVertical: 20 },
  solver: { maxIterations: 2000, residualTolerance: 1e-7, timeoutSeconds: 120 }
};

const artifactHash = "a".repeat(64);
const sampleCoordinates = [0, 0.0025, 0.005, 0.0075, 0.01];

function validResult(overrides: Partial<OpenFOAMLaminarChannelResult> = {}): OpenFOAMLaminarChannelResult {
  const massFlux = request.densityKgM3 * request.meanVelocityMps * request.heightM * request.depthM;
  return {
    status: "COMPLETED",
    solver: "OpenFOAM",
    solverVersion: "14",
    converged: true,
    meshCells: request.mesh.cellsAxial * request.mesh.cellsVertical,
    pressureDropPa: expectedPoiseuillePressureDropPa(request),
    massFluxInKgS: massFlux,
    massFluxOutKgS: massFlux,
    residuals: { pressure: 1e-8, velocity: 1e-8 },
    velocityProfile: sampleCoordinates.map(yM => ({
      yM,
      axialVelocityMps: poiseuilleAxialVelocity(yM, request.heightM, request.meanVelocityMps)
    })),
    artifacts: [
      { kind: "MESH", path: "artifacts/mesh.foam", mediaType: "application/octet-stream", sha256: artifactHash },
      { kind: "VELOCITY_FIELD", path: "artifacts/U", mediaType: "text/plain", sha256: artifactHash },
      { kind: "PRESSURE_FIELD", path: "artifacts/p", mediaType: "text/plain", sha256: artifactHash },
      { kind: "SOLVER_LOG", path: "artifacts/solver.log", mediaType: "text/plain", sha256: artifactHash }
    ],
    warnings: [],
    ...overrides
  };
}

describe("V1.25 OpenFOAM request contract", () => {
  it("accepts the bounded laminar benchmark manifest", () => {
    expect(validateOpenFOAMLaminarChannelRequest(request)).toEqual([]);
  });

  it("rejects malformed envelopes and unsupported Reynolds numbers", () => {
    expect(validateOpenFOAMLaminarChannelRequest(null)).toContain(
      "The OpenFOAM benchmark request must be an object."
    );
    expect(validateOpenFOAMLaminarChannelRequest({
      ...request,
      meanVelocityMps: 1,
      kinematicViscosityM2PerS: 1e-5
    }).some(error => error.includes("Reynolds number"))).toBe(true);
  });

  it("rejects excessive mesh size and unbounded solver settings", () => {
    const errors = validateOpenFOAMLaminarChannelRequest({
      ...request,
      mesh: { cellsAxial: 1000, cellsVertical: 200 },
      solver: { maxIterations: 20000, residualTolerance: 1e-9, timeoutSeconds: 900 }
    });
    expect(errors.some(error => error.includes("100000 cells"))).toBe(true);
    expect(errors.some(error => error.includes("maxIterations"))).toBe(true);
    expect(errors.some(error => error.includes("timeoutSeconds"))).toBe(true);
  });
});

describe("V1.25 analytical Poiseuille reference", () => {
  it("returns zero velocity at both walls and 1.5 times mean velocity at the centreline", () => {
    expect(poiseuilleAxialVelocity(0, request.heightM, request.meanVelocityMps)).toBe(0);
    expect(poiseuilleAxialVelocity(request.heightM / 2, request.heightM, request.meanVelocityMps)).toBeCloseTo(0.3);
    expect(poiseuilleAxialVelocity(request.heightM, request.heightM, request.meanVelocityMps)).toBe(0);
  });

  it("calculates the analytical pressure drop for a plane channel", () => {
    expect(expectedPoiseuillePressureDropPa(request)).toBeCloseTo(48);
  });
});

describe("V1.25 independent CFD result validation", () => {
  it("accepts a solver result matching the analytical profile and conservation limits", () => {
    const validation = validateOpenFOAMLaminarChannelResult(request, validResult());
    expect(validation.status).toBe("PASS");
    expect(validation.normalizedProfileRmse).toBeCloseTo(0);
    expect(validation.pressureRelativeError).toBeCloseTo(0);
    expect(validation.massBalanceRelativeError).toBeCloseTo(0);
  });

  it("rejects pressure-drop and mass-conservation deviations", () => {
    const result = validResult({
      pressureDropPa: expectedPoiseuillePressureDropPa(request) * 1.1,
      massFluxOutKgS: (validResult().massFluxOutKgS ?? 0) * 1.02
    });
    const validation = validateOpenFOAMLaminarChannelResult(request, result);
    expect(validation.status).toBe("FAIL");
    expect(validation.blockingReasons.some(reason => reason.includes("Pressure drop"))).toBe(true);
    expect(validation.blockingReasons.some(reason => reason.includes("Mass conservation"))).toBe(true);
  });

  it("fails closed on out-of-domain profile coordinates and unsafe artifact paths", () => {
    const result = validResult({
      velocityProfile: [
        ...validResult().velocityProfile.slice(0, 4),
        { yM: request.heightM * 1.1, axialVelocityMps: 0 }
      ],
      artifacts: validResult().artifacts.map(artifact => ({
        ...artifact,
        path: artifact.kind === "MESH" ? "../outside/mesh.foam" : artifact.path
      }))
    });
    const validation = validateOpenFOAMLaminarChannelResult(request, result);
    expect(validation.status).toBe("FAIL");
    expect(validation.blockingReasons.some(reason => reason.includes("profile"))).toBe(true);
    expect(validation.blockingReasons.some(reason => reason.includes("artifact"))).toBe(true);
  });

  it("returns incomplete when required solver artifacts are absent", () => {
    const result = validResult({ artifacts: [] });
    const validation = validateOpenFOAMLaminarChannelResult(request, result);
    expect(validation.status).toBe("INCOMPLETE");
    expect(validation.blockingReasons.some(reason => reason.includes("MESH"))).toBe(true);
  });
});

describe("V1.25 OpenFOAM provider boundary", () => {
  it("returns unavailable without an isolated worker and does not claim a solve", async () => {
    const provider = new OpenFOAMProvider();
    const response = await provider.execute({
      capability: "ANALYSIS.CFD_LAMINAR_CHANNEL",
      risk: "HIGH",
      input: request as unknown as Record<string, unknown>
    });
    expect(response.success).toBe(false);
    expect((response.output as { status: string }).status).toBe("UNAVAILABLE");
    expect(response.error).toContain("No CFD solver was executed");
  });

  it("validates and routes a result through the analytical acceptance gate", async () => {
    const provider = new OpenFOAMProvider({
      runLaminarChannel: async () => validResult()
    });
    const registry = new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.registerCatalog(V1_25_CAPABILITIES);
    registry.register(provider);
    const router = new CapabilityRouter(registry);
    const response = await router.execute({
      capability: "ANALYSIS.CFD_LAMINAR_CHANNEL",
      risk: "HIGH",
      input: request as unknown as Record<string, unknown>
    });
    expect(response.success).toBe(true);
    expect((response.output as { validation: { status: string } }).validation.status).toBe("PASS");
  });

  it("rejects invalid manifests before contacting the worker", async () => {
    let called = false;
    const provider = new OpenFOAMProvider({
      runLaminarChannel: async () => {
        called = true;
        return validResult();
      }
    });
    const response = await provider.execute({
      capability: "ANALYSIS.CFD_LAMINAR_CHANNEL",
      risk: "HIGH",
      input: { ...request, meanVelocityMps: 1, kinematicViscosityM2PerS: 1e-5 }
    });
    expect(response.success).toBe(false);
    expect(called).toBe(false);
  });
});
