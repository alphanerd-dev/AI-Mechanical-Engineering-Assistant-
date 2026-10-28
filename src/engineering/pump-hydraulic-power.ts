import type { ValidationResult } from "../artifacts/calculation-artifact.js";
import { z } from "zod";

export const PUMP_HYDRAULIC_POWER_CAPABILITY = "ANALYSIS.PUMP_HYDRAULIC_POWER";
export const PUMP_HYDRAULIC_POWER_VERSION = "1.0.0";
export const PUMP_HYDRAULIC_POWER_VALIDATOR_ID = "engineering.pump-hydraulic-power";
export const PUMP_HYDRAULIC_POWER_VALIDATOR_VERSION = "1.0.0";
export const STANDARD_GRAVITY_M_PER_S2 = 9.80665;

export type DensityUnit = "kg/m3" | "g/cm3";
export type FlowRateUnit = "m3/s" | "L/s" | "m3/h";
export type HeadUnit = "m" | "ft";

export interface UnitQuantity<TUnit extends string> {
  value: number;
  unit: TUnit;
}

export interface PumpHydraulicPowerInput {
  density: UnitQuantity<DensityUnit>;
  flowRate: UnitQuantity<FlowRateUnit>;
  head: UnitQuantity<HeadUnit>;
  efficiencyPercent: number;
}

export interface NormalizedPumpHydraulicPowerInput {
  densityKgM3: number;
  flowRateM3S: number;
  headM: number;
  efficiencyFraction: number;
  gravityMPerS2: number;
}

export interface PumpHydraulicPowerResult {
  normalizedInputs: NormalizedPumpHydraulicPowerInput;
  hydraulicPowerW: number;
  hydraulicPowerKw: number;
  shaftPowerW: number;
  shaftPowerKw: number;
  hydraulicEquation: "P_h = rho * g * Q * H";
  shaftEquation: "P_shaft = P_h / eta";
  assumptions: string[];
  informationStatus: "CALCULATED";
}

export interface PumpHydraulicPowerValidation {
  result: ValidationResult;
  validatorId: typeof PUMP_HYDRAULIC_POWER_VALIDATOR_ID;
  validatorVersion: typeof PUMP_HYDRAULIC_POWER_VALIDATOR_VERSION;
  checks: string[];
  warnings: string[];
  validatedAt: string;
}

const unitQuantitySchema = <TUnit extends readonly [string, ...string[]]>(units: TUnit) =>
  z.object({ value: z.number().finite(), unit: z.enum(units) }).strict();

const pumpHydraulicPowerInputSchema = z.object({
  density: unitQuantitySchema(["kg/m3", "g/cm3"]),
  flowRate: unitQuantitySchema(["m3/s", "L/s", "m3/h"]),
  head: unitQuantitySchema(["m", "ft"]),
  efficiencyPercent: z.number().finite()
}).strict();

/** Zod validates untrusted API/provider payloads and strips ambiguity by rejecting unknown keys. */
export function parsePumpHydraulicPowerInput(value: unknown): PumpHydraulicPowerInput {
  const parsed = pumpHydraulicPowerInputSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 8).map((issue) => {
      const field = issue.path.length ? issue.path.join(".") : "pumpInput";
      return field + ": " + issue.message;
    });
    throw new Error("Invalid pump calculation input: " + details.join("; "));
  }
  return parsed.data;
}

export function normalizePumpHydraulicPowerInput(rawValue: unknown): {
  input: PumpHydraulicPowerInput;
  normalized: NormalizedPumpHydraulicPowerInput;
} {
  const input = parsePumpHydraulicPowerInput(rawValue);
  const densityKgM3 = input.density.unit === "kg/m3" ? input.density.value : input.density.value * 1000;
  const flowRateM3S = input.flowRate.unit === "m3/s"
    ? input.flowRate.value
    : input.flowRate.unit === "L/s"
      ? input.flowRate.value / 1000
      : input.flowRate.value / 3600;
  const headM = input.head.unit === "m" ? input.head.value : input.head.value * 0.3048;
  const efficiencyFraction = input.efficiencyPercent / 100;

  if (densityKgM3 < 1 || densityKgM3 > 25_000) throw new Error("Converted fluid density must be between 1 and 25,000 kg/m³.");
  if (flowRateM3S <= 0 || flowRateM3S > 1_000) throw new Error("Converted flow rate must be greater than 0 and at most 1,000 m³/s.");
  if (headM <= 0 || headM > 1_000_000) throw new Error("Converted pump head must be greater than 0 and at most 1,000,000 m.");
  if (input.efficiencyPercent <= 0 || input.efficiencyPercent > 100) throw new Error("Pump efficiency must be greater than 0% and at most 100%.");

  const normalized: NormalizedPumpHydraulicPowerInput = {
    densityKgM3, flowRateM3S, headM, efficiencyFraction,
    gravityMPerS2: STANDARD_GRAVITY_M_PER_S2
  };
  if (!Object.values(normalized).every((number) => Number.isFinite(number) && number > 0)) {
    throw new Error("Normalized pump inputs are outside the finite positive numeric range.");
  }
  return { input, normalized };
}

/** Deterministic steady-flow power calculation. Input values and units are never inferred. */
export function calculatePumpHydraulicPower(rawInput: unknown): {
  input: PumpHydraulicPowerInput;
  result: PumpHydraulicPowerResult;
} {
  const { input, normalized: normalizedInputs } = normalizePumpHydraulicPowerInput(rawInput);
  return calculateNormalizedPumpPower(input, normalizedInputs);
}

function calculateNormalizedPumpPower(
  input: PumpHydraulicPowerInput,
  normalizedInputs: NormalizedPumpHydraulicPowerInput
): { input: PumpHydraulicPowerInput; result: PumpHydraulicPowerResult } {
  const hydraulicPowerW = normalizedInputs.densityKgM3 * normalizedInputs.gravityMPerS2 *
    normalizedInputs.flowRateM3S * normalizedInputs.headM;
  const shaftPowerW = hydraulicPowerW / normalizedInputs.efficiencyFraction;
  const values = [hydraulicPowerW, shaftPowerW, hydraulicPowerW / 1000, shaftPowerW / 1000];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Calculated pump power is outside the finite positive numeric range.");
  }
  return {
    input,
    result: {
      normalizedInputs,
      hydraulicPowerW,
      hydraulicPowerKw: hydraulicPowerW / 1000,
      shaftPowerW,
      shaftPowerKw: shaftPowerW / 1000,
      hydraulicEquation: "P_h = rho * g * Q * H",
      shaftEquation: "P_shaft = P_h / eta",
      assumptions: [
        "Steady incompressible flow; density, flow rate and total dynamic head are user-supplied.",
        "Efficiency is entered as a percentage and represents pump efficiency only; motor/drive losses are excluded unless the user includes them in the supplied efficiency.",
        "This calculation estimates power demand; it does not select a pump or validate a system curve, cavitation margin, NPSH, or operating point."
      ],
      informationStatus: "CALCULATED"
    }
  };
}

/** Separate capability-specific validator; it recomputes SI conversions and governing equations. */
export function validatePumpHydraulicPower(
  rawInput: unknown,
  result: PumpHydraulicPowerResult,
  validatedAt = new Date().toISOString()
): PumpHydraulicPowerValidation {
  const checks: string[] = [];
  const warnings: string[] = [];
  const fail = (check: string, warning: string) => {
    warnings.push(warning);
    return check;
  };

  let input: PumpHydraulicPowerInput;
  try {
    input = parsePumpHydraulicPowerInput(rawInput);
    const densityExpected = input.density.unit === "kg/m3" ? input.density.value : input.density.value * 1000;
    const flowExpected = input.flowRate.unit === "m3/s"
      ? input.flowRate.value
      : input.flowRate.unit === "L/s"
        ? input.flowRate.value / 1000
        : input.flowRate.value / 3600;
    const headExpected = input.head.unit === "m" ? input.head.value : input.head.value * 0.3048;
    const efficiencyExpected = input.efficiencyPercent / 100;
    if (densityExpected < 1 || densityExpected > 25_000 ||
        flowExpected <= 0 || flowExpected > 1_000 ||
        headExpected <= 0 || headExpected > 1_000_000 ||
        efficiencyExpected <= 0 || efficiencyExpected > 1) {
      fail("physical-input-ranges", "One or more inputs are outside the supported physical/numeric bounds.");
    } else checks.push("physical-input-ranges");

    const normalized = result.normalizedInputs;
    const close = (actual: number, expected: number) =>
      Number.isFinite(actual) && Number.isFinite(expected) &&
      Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-10);
    if (close(normalized.densityKgM3, densityExpected) &&
        close(normalized.flowRateM3S, flowExpected) &&
        close(normalized.headM, headExpected) &&
        close(normalized.efficiencyFraction, efficiencyExpected) &&
        close(normalized.gravityMPerS2, STANDARD_GRAVITY_M_PER_S2)) {
      checks.push("explicit-unit-conversion");
    } else fail("explicit-unit-conversion", "Normalized SI inputs do not match the supplied values and units.");

    const hydraulicExpected = densityExpected * STANDARD_GRAVITY_M_PER_S2 * flowExpected * headExpected;
    if (close(result.hydraulicPowerW, hydraulicExpected)) checks.push("hydraulic-power-equation");
    else fail("hydraulic-power-equation", "Hydraulic power does not match rho * g * Q * H.");

    const shaftExpected = hydraulicExpected / efficiencyExpected;
    if (close(result.shaftPowerW, shaftExpected) && result.shaftPowerW >= result.hydraulicPowerW) {
      checks.push("shaft-power-efficiency-relation");
    } else fail("shaft-power-efficiency-relation", "Shaft power does not match hydraulic power divided by efficiency.");

    if (close(result.hydraulicPowerKw, result.hydraulicPowerW / 1000) &&
        close(result.shaftPowerKw, result.shaftPowerW / 1000)) {
      checks.push("watt-to-kilowatt-conversion");
    } else fail("watt-to-kilowatt-conversion", "W-to-kW conversion is inconsistent.");

    if ([result.hydraulicPowerW, result.hydraulicPowerKw, result.shaftPowerW, result.shaftPowerKw].every((value) => Number.isFinite(value) && value > 0)) {
      checks.push("finite-positive-outputs");
    } else fail("finite-positive-outputs", "One or more outputs are not finite positive numbers.");
  } catch (error) {
    fail("validation-input", error instanceof Error ? error.message : "Validation inputs could not be parsed.");
  }

  return {
    result: warnings.length === 0 ? "PASS" : "FAIL",
    validatorId: PUMP_HYDRAULIC_POWER_VALIDATOR_ID,
    validatorVersion: PUMP_HYDRAULIC_POWER_VALIDATOR_VERSION,
    checks,
    warnings,
    validatedAt
  };
}
