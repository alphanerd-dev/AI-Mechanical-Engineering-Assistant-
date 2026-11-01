import { describe, expect, it } from "vitest";
import { NumericalAnalysisProvider } from "../src/providers/numerical.js";
import { DeterministicShaftIntentInterpreter } from "../src/intent/shaft.js";
import {
  calculateShaftStaticDesign,
  type ShaftStaticDesignInput
} from "../src/engineering/shaft-static-design.js";
import {
  createShaftDesignWorkspaceState,
  validateShaftDesignWorkspaceState
} from "../src/workspace/shaft-design-state.js";

const referenceInput: ShaftStaticDesignInput = {
  powerKw: 15,
  speedRpm: 1450,
  bearingSpanMm: 400,
  gearPositionFromLeftMm: 150,
  pitchDiameterMm: 180,
  pressureAngleDeg: 20,
  axialLoadN: 1800,
  materialGrade: "AISI 4140",
  yieldStrengthMpa: 415,
  ultimateTensileStrengthMpa: 655,
  designFactor: 3,
  bendingStressFactorKb: 2,
  torsionalStressFactorKts: 1.6
};

describe("deterministic shaft static-yield design", () => {
  it("reproduces the independently checked multi-turn shaft scenario", () => {
    const result = calculateShaftStaticDesign(referenceInput);
    expect(result.torqueNm).toBeCloseTo(98.7858267, 5);
    expect(result.tangentialForceN).toBeCloseTo(1097.6203, 3);
    expect(result.radialForceN).toBeCloseTo(399.5011, 3);
    expect(result.resultantTransverseForceN).toBeCloseTo(1168.0631, 3);
    expect(result.leftBearingReactionN).toBeCloseTo(730.0395, 3);
    expect(result.rightBearingReactionN).toBeCloseTo(438.0237, 3);
    expect(result.maximumBendingMomentNm).toBeCloseTo(109.505918, 5);
    expect(result.minimumDiameterMm).toBeCloseTo(26.86815, 4);
    expect(result.preferredDiameterMm).toBe(28);
    expect(result.candidateDiameterMm).toBe(28);
    expect(result.axialStressMpa).toBeCloseTo(2.92325, 4);
    expect(result.bendingStressMpa).toBeCloseTo(101.62337, 4);
    expect(result.torsionalShearStressMpa).toBeCloseTo(36.66998, 4);
    expect(result.vonMisesStressMpa).toBeCloseTo(122.32767, 4);
    expect(result.achievedYieldFactorOfSafety).toBeCloseTo(3.39253, 4);
    expect(result.passesStaticYield).toBe(true);
    expect(result.assumptions.some((item) => item.includes("fatigue factors"))).toBe(true);
    expect(result.limitations.some((item) => item.includes("Fatigue under rotating bending"))).toBe(true);
  });

  it("recalculates all downstream results when corrected power changes", () => {
    const at12kW = calculateShaftStaticDesign({ ...referenceInput, powerKw: 12 });
    const at15kW = calculateShaftStaticDesign({ ...referenceInput, powerKw: 15 });
    expect(at15kW.torqueNm / at12kW.torqueNm).toBeCloseTo(1.25, 10);
    expect(at15kW.tangentialForceN / at12kW.tangentialForceN).toBeCloseTo(1.25, 10);
    expect(at15kW.maximumBendingMomentNm / at12kW.maximumBendingMomentNm).toBeCloseTo(1.25, 10);
    expect(at15kW.minimumDiameterMm).toBeGreaterThan(at12kW.minimumDiameterMm);
  });

  it("recomputes reactions and bending moment when the gear is moved along the span", () => {
    const atMidspan = calculateShaftStaticDesign({ ...referenceInput, gearPositionFromLeftMm: 200 });
    const at150mm = calculateShaftStaticDesign({ ...referenceInput, gearPositionFromLeftMm: 150 });
    expect(at150mm.leftBearingReactionN).not.toBeCloseTo(atMidspan.leftBearingReactionN, 2);
    expect(at150mm.rightBearingReactionN).not.toBeCloseTo(atMidspan.rightBearingReactionN, 2);
    expect(at150mm.maximumBendingMomentNm).toBeLessThan(atMidspan.maximumBendingMomentNm);
    expect(at150mm.bendingMomentLocationMm).toBe(150);
  });

  it("exposes the new shaft calculation through the numerical capability provider", async () => {
    const provider = new NumericalAnalysisProvider();
    const response = await provider.execute({
      capability: "ANALYSIS.SHAFT_STATIC_DESIGN",
      risk: "MEDIUM",
      input: referenceInput as unknown as Record<string, unknown>
    });
    expect(response.success).toBe(true);
    expect((response.output as ReturnType<typeof calculateShaftStaticDesign>).minimumDiameterMm).toBeCloseTo(26.86815, 4);
  });

  it("recomputes the preferred size when a candidate diameter is explicitly supplied", () => {
    const result = calculateShaftStaticDesign({ ...referenceInput, candidateDiameterMm: 25 });
    expect(result.preferredDiameterMm).toBe(28);
    expect(result.candidateDiameterMm).toBe(25);
    expect(result.passesStaticYield).toBe(false);
    expect(result.achievedYieldFactorOfSafety).toBeLessThan(3);
  });

  it("rejects invalid geometry, materials, factors and loads", () => {
    expect(() => calculateShaftStaticDesign({ ...referenceInput, gearPositionFromLeftMm: 400 })).toThrow(/strictly inside/);
    expect(() => calculateShaftStaticDesign({ ...referenceInput, pitchDiameterMm: 0 })).toThrow(/pitchDiameterMm/);
    expect(() => calculateShaftStaticDesign({ ...referenceInput, pressureAngleDeg: 90 })).toThrow(/pressureAngleDeg/);
    expect(() => calculateShaftStaticDesign({ ...referenceInput, ultimateTensileStrengthMpa: 300 })).toThrow(/must not be lower/);
    expect(() => calculateShaftStaticDesign({ ...referenceInput, bendingStressFactorKb: 0.8 })).toThrow(/at least 1/);
    expect(() => calculateShaftStaticDesign({ ...referenceInput, axialLoadN: Number.NaN })).toThrow(/finite number/);
  });
});

describe("persistent shaft design state", () => {
  it("binds the state to exact inputs, deterministic outputs and workspace revisions", () => {
    const result = calculateShaftStaticDesign(referenceInput);
    const state = createShaftDesignWorkspaceState({
      designRevision: 1,
      sourceWorkspaceRevision: 4,
      workspaceRevision: 5,
      updatedAt: "2026-11-01T12:00:00.000Z",
      updatedBy: "test-user",
      idempotencyKey: "shaft-design-test-1",
      artifactId: "artifact-shaft-1",
      shaftInput: referenceInput,
      result
    });
    expect(validateShaftDesignWorkspaceState(state)).toEqual([]);
    expect(validateShaftDesignWorkspaceState({
      ...state,
      result: { ...state.result, torqueNm: state.result.torqueNm + 1 }
    })).toContain("Persisted shaft design result does not match resultSha256.");
  });
});


describe("deterministic shaft intent parsing", () => {
  const interpreter = new DeterministicShaftIntentInterpreter();

  it("derives midpoint gear position and does not request a user-entered bending moment", async () => {
    const result = await interpreter.interpret(
      "Design a shaft transmitting 12 kW at 1450 rpm, with bearings 400 mm apart, " +
      "the gear at midpoint, a pitch diameter of 180 mm, a pressure angle of 20 degrees, " +
      "AISI 1020 steel, Sy 350 MPa, Sut 420 MPa, and design factor 2.5. Ignore axial load."
    );

    expect(result.completionUnit).toBe("ENGINEERING.COMPLETE_SHAFT");
    expect(result.missingInputs).toEqual([]);
    expect(result.extractedInputs.gearPositionFromLeftMm).toBe(200);
    expect(result.extractedInputs.bendingMomentNm).toBeUndefined();
  });

  it("rejects oversized raw intent before applying extraction patterns", async () => {
    await expect(interpreter.interpret("0".repeat(12_001)))
      .rejects.toThrow(/12000-character limit/);
  });
});
