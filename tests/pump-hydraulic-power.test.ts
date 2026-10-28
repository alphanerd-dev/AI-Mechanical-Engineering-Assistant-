import { describe, expect, it } from "vitest";
import { createCalculationArtifact, validateCalculationArtifact } from "../src/artifacts/calculation-artifact.js";
import {
  calculatePumpHydraulicPower,
  normalizePumpHydraulicPowerInput,
  validatePumpHydraulicPower
} from "../src/engineering/pump-hydraulic-power.js";

const waterAtDutyPoint = {
  density: { value: 1000, unit: "kg/m3" as const },
  flowRate: { value: 20, unit: "L/s" as const },
  head: { value: 20, unit: "m" as const },
  efficiencyPercent: 75
};

describe("pump hydraulic and shaft power", () => {
  it("calculates the governing equations with explicit SI conversions", () => {
    const { result } = calculatePumpHydraulicPower(waterAtDutyPoint);
    expect(result.normalizedInputs.flowRateM3S).toBeCloseTo(0.02, 12);
    expect(result.hydraulicPowerW).toBeCloseTo(3922.66, 8);
    expect(result.hydraulicPowerKw).toBeCloseTo(3.92266, 8);
    expect(result.shaftPowerW).toBeCloseTo(5230.213333333333, 8);
    expect(result.shaftPowerKw).toBeCloseTo(5.230213333333333, 8);
    expect(result.informationStatus).toBe("CALCULATED");
  });

  it("produces the same result for equivalent density, flow and head units", () => {
    const metric = calculatePumpHydraulicPower(waterAtDutyPoint).result;
    const converted = calculatePumpHydraulicPower({
      density: { value: 1, unit: "g/cm3" },
      flowRate: { value: 72, unit: "m3/h" },
      head: { value: 65.61679790026247, unit: "ft" },
      efficiencyPercent: 75
    }).result;
    expect(converted.hydraulicPowerKw).toBeCloseTo(metric.hydraulicPowerKw, 8);
    expect(converted.shaftPowerKw).toBeCloseTo(metric.shaftPowerKw, 8);
  });

  it("rejects missing/unsupported units and physically invalid inputs", () => {
    expect(() => normalizePumpHydraulicPowerInput({
      ...waterAtDutyPoint, density: { value: 1000, unit: "lb/ft3" }
    })).toThrow(/density\.unit/);
    expect(() => calculatePumpHydraulicPower({
      ...waterAtDutyPoint, density: { value: 0, unit: "kg/m3" }
    })).toThrow(/density/);
    expect(() => calculatePumpHydraulicPower({
      ...waterAtDutyPoint, flowRate: { value: -1, unit: "L/s" }
    })).toThrow(/flow rate/);
    expect(() => calculatePumpHydraulicPower({
      ...waterAtDutyPoint, head: { value: 0, unit: "m" }
    })).toThrow(/pump head/);
    expect(() => calculatePumpHydraulicPower({ ...waterAtDutyPoint, efficiencyPercent: 0 })).toThrow(/efficiency/);
    expect(() => calculatePumpHydraulicPower({ ...waterAtDutyPoint, efficiencyPercent: 100.1 })).toThrow(/efficiency/);
  });

  it("rejects unknown API fields rather than silently accepting ambiguous inputs", () => {
    expect(() => calculatePumpHydraulicPower({
      ...waterAtDutyPoint,
      hiddenAssumption: 0.9
    })).toThrow(/hiddenAssumption/);
    expect(() => calculatePumpHydraulicPower({
      ...waterAtDutyPoint,
      density: { value: 1000, unit: "kg/m3", correctionFactor: 2 }
    })).toThrow(/density/);
  });

  it("runs an independent capability validator and catches a tampered result", () => {
    const { input, result } = calculatePumpHydraulicPower(waterAtDutyPoint);
    expect(validatePumpHydraulicPower(input, result, "2026-10-28T12:00:00.000Z").result).toBe("PASS");
    const tampered = { ...result, shaftPowerW: result.shaftPowerW * 0.5 };
    const failed = validatePumpHydraulicPower(input, tampered, "2026-10-28T12:00:00.000Z");
    expect(failed.result).toBe("FAIL");
    expect(failed.warnings.join(" ")).toMatch(/shaft power/i);
  });

  it("binds a persisted artifact receipt to exact input/output digests without claiming verification", () => {
    const { input, result } = calculatePumpHydraulicPower(waterAtDutyPoint);
    const validation = validatePumpHydraulicPower(input, result, "2026-10-28T12:00:00.000Z");
    const artifact = createCalculationArtifact({
      id: "artifact-1",
      projectId: "project-1",
      name: "Pump hydraulic power calculation",
      capability: "ANALYSIS.PUMP_HYDRAULIC_POWER",
      sourceRevision: 4,
      workspaceRevision: 5,
      createdBy: "engineer-1",
      createdAt: "2026-10-28T12:00:00.000Z",
      providerId: "deterministic.pump-hydraulic-power",
      providerVersion: "1.0.0",
      inputs: input as unknown as Record<string, unknown>,
      outputs: result as unknown as Record<string, unknown>,
      executionStatus: "COMPLETED",
      validation: { id: "validation-1", ...validation },
      approvalRequired: false,
      approvalStatus: "NOT_REQUESTED",
      verificationStatus: "NOT_VERIFIED",
      limitations: result.assumptions
    });
    expect(artifact.validationStatus).toBe("VALIDATED");
    expect(artifact.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.validationReceipt.inputSha256).toBe(artifact.inputSha256);
    expect(artifact.validationReceipt.outputSha256).toBe(artifact.outputSha256);
    expect(artifact.verificationStatus).toBe("NOT_VERIFIED");
    expect(validateCalculationArtifact(artifact)).toEqual([]);
    expect(validateCalculationArtifact({ ...artifact, outputs: { ...result, shaftPowerKw: 0 } })).toContain(
      "Calculation artifact outputs do not match outputSha256."
    );
  });
});
