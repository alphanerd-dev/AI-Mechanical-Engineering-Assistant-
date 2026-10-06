import { UnitValue } from "./types.js";

const FACTORS: Record<string, number> = {
  m: 1,
  mm: 1e-3,
  cm: 1e-2,
  s: 1,
  min: 60,
  N: 1,
  kN: 1e3,
  Pa: 1,
  kPa: 1e3,
  MPa: 1e6,
  W: 1,
  kW: 1e3,
};

export function convert(value: UnitValue, targetUnit: string): UnitValue {
  const from = FACTORS[value.unit];
  const to = FACTORS[targetUnit];
  if (from === undefined || to === undefined) throw new Error(`Unsupported unit conversion: ${value.unit} -> ${targetUnit}`);
  return { value: value.value * from / to, unit: targetUnit };
}

export function assertFiniteUnitValue(value: UnitValue): UnitValue {
  if (!Number.isFinite(value.value)) throw new Error("Engineering value must be finite.");
  if (!value.unit) throw new Error("Engineering value requires an explicit unit.");
  return value;
}
