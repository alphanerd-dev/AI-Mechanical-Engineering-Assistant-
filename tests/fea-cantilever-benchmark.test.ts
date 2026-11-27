import { describe, expect, it } from "vitest";
import {
  validateFEACantileverBoxRequest,
  validateFEACantileverBoxResult
} from "../src/fea/benchmark.js";
import type {
  FEACantileverBoxBenchmarkRequest,
  FEAStaticStructuralResult
} from "../src/fea/types.js";

const request: FEACantileverBoxBenchmarkRequest = {
  analysis: "STATIC_STRUCTURAL",
  benchmark: "cantilever_box",
  dimensionsMm: { length: 200, width: 20, height: 10 },
  material: { youngsModulusMpa: 210000, poissonRatio: 0.3 },
  totalForceN: 100,
  elementSizeMm: 10
};
function referenceResult(): FEAStaticStructuralResult {
  const { length, width, height } = request.dimensionsMm;
  const force = request.totalForceN;
  const modulus = request.material.youngsModulusMpa;
  const poisson = request.material.poissonRatio;
  const inertia = height * width ** 3 / 12;
  const area = width * height;
  const shearModulus = modulus / (2 * (1 + poisson));
  const bending = force * length ** 3 / (3 * modulus * inertia);
  const shear = 6 * force * length / (5 * shearModulus * area);
  const expected = bending + shear;
  const measured = expected * 1.02;
  return {
    success: true,
    analysis: "STATIC_STRUCTURAL",
    solver: "calculix",
    solverVersion: "2.20",
    converged: true,
    exitCode: 0,
    mesh: { nodeCount: 100, elementCount: 200, elementType: "C3D4" },
    maxVonMisesStressMpa: 10,
    maxDisplacementMm: measured,
    reactionForcesN: { x: 0, y: 100, z: 0 },
    artifacts: [
      { kind: "FEA_MODEL", path: "v1_18_cantilever.inp", mediaType: "text/plain", sha256: "a".repeat(64) },
      { kind: "FEA_RESULT", path: "v1_18_cantilever.dat", mediaType: "text/plain", sha256: "b".repeat(64) },
      { kind: "FEA_RESULT", path: "v1_18_cantilever.frd", mediaType: "application/octet-stream", sha256: "c".repeat(64) },
      { kind: "FEA_RESULT", path: "v1_18_cantilever.sta", mediaType: "text/plain", sha256: "d".repeat(64) }
    ],
    warnings: [],
    benchmarkReference: {
      referenceId: "cantilever-box-euler-bernoulli-plus-timoshenko-v2",
      units: { length: "mm", force: "N", modulus: "MPa", deflection: "mm" },
      sectionSecondMomentMm4: inertia,
      bendingDeflectionMm: bending,
      firstOrderShearDeflectionMm: shear,
      expectedTipDeflectionMm: expected,
      measuredMaximumDisplacementMm: measured,
      displacementRelativeError: Math.abs(measured - expected) / expected,
      displacementRelativeTolerance: 0.1,
      displacementPassed: true,
      expectedSupportReactionN: { x: 0, y: 100, z: 0 },
      measuredSupportReactionN: { x: 0, y: 100, z: 0 },
      reactionRelativeError: 0,
      reactionRelativeTolerance: 0.01,
      reactionPassed: true,
      passed: true
    }
  };
}

describe("CalculiX cantilever-box benchmark contract", () => {
  it("accepts bounded reference benchmark inputs", () => {
    expect(validateFEACantileverBoxRequest(request)).toEqual([]);
  });

  it("rejects unsupported benchmarks and excessive mesh requests", () => {
    expect(validateFEACantileverBoxRequest({ ...request, totalForceN: 1e-13 })).toContain(
      "totalForceN must be between 1e-12 and 1e9 N."
    );
    expect(validateFEACantileverBoxRequest({ ...request, benchmark: "arbitrary_mesh" })).toContain(
      "Only the cantilever_box reference benchmark is supported."
    );
    expect(validateFEACantileverBoxRequest({ ...request, elementSizeMm: 0.1 })).toContain(
      "elementSizeMm must be between 1 and 100 mm."
    );
    expect(validateFEACantileverBoxRequest({
      ...request, dimensionsMm: { length: 100, width: 30, height: 30 }
    })).toContain("Cantilever benchmark length must be at least five times its largest cross-section dimension.");
  });

  it("accepts solver results only after independent analytical and reaction checks", () => {
    const result = referenceResult();
    expect(validateFEACantileverBoxResult(request, result).status).toBe("PASS");
  });

  it("preserves the original v1 displacement-tolerance contract for stored receipts", () => {
    const result = referenceResult();
    const reference = result.benchmarkReference!;
    reference.referenceId = "cantilever-box-euler-bernoulli-plus-timoshenko-v1";
    reference.displacementRelativeTolerance = 0.3;
    reference.displacementRelativeError = 0.29;
    reference.measuredMaximumDisplacementMm = reference.expectedTipDeflectionMm * 1.29;
    result.maxDisplacementMm = reference.measuredMaximumDisplacementMm;
    expect(validateFEACantileverBoxResult(request, result).status).toBe("PASS");
  });

  it("rejects a displacement reference that declares a tolerance above ten percent", () => {
    const result = referenceResult();
    result.benchmarkReference!.displacementRelativeTolerance = 0.11;
    expect(validateFEACantileverBoxResult(request, result).status).toBe("FAIL");
  });

  it("rejects a worker result with a tampered analytical reference", () => {
    const result = referenceResult();
    result.benchmarkReference!.expectedTipDeflectionMm += 1;
    expect(validateFEACantileverBoxResult(request, result).status).toBe("FAIL");
  });

  it("rejects traversal, absolute, drive-qualified and malformed solver artifact paths", () => {
    const unsafePaths = [
      "../outside.inp",
      "nested/../outside.inp",
      "/etc/passwd",
      "C:\\outside.inp",
      "\\\\server\\share\\outside.inp",
      "nested/./part.inp",
      "nested//part.inp",
      "invalid" + String.fromCharCode(0) + "path.inp"
    ];
    for (const path of unsafePaths) {
      const result = referenceResult();
      result.artifacts[0] = { ...result.artifacts[0], path };
      const validation = validateFEACantileverBoxResult(request, result);
      expect(validation.status, path).toBe("FAIL");
      expect(validation.blockingReasons.join(" "), path).toMatch(/unsafe/);
    }
  });
});
