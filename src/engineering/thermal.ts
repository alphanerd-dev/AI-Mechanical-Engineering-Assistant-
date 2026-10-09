export interface SensibleSpecificEnergyResult {
  specificEnergyKjPerKg: number;
}

export interface SensibleHeatDutyResult {
  heatDutyKw: number;
}

/**
 * Calculate sensible energy per unit mass for a single-phase temperature rise.
 * Specific heat is explicitly supplied in J/(kg·K); temperatures are in °C.
 * The model assumes constant specific heat across the interval.
 */
export function calculateSensibleSpecificEnergy(
  specificHeatJPerKgK: number,
  inletTemperatureC: number,
  outletTemperatureC: number
): SensibleSpecificEnergyResult {
  if (
    !Number.isFinite(specificHeatJPerKgK) ||
    !Number.isFinite(inletTemperatureC) ||
    !Number.isFinite(outletTemperatureC)
  ) {
    throw new Error("Specific heat and temperatures must be finite.");
  }
  if (specificHeatJPerKgK <= 0) {
    throw new Error("Specific heat must be positive.");
  }
  if (outletTemperatureC <= inletTemperatureC) {
    throw new Error("Outlet temperature must exceed inlet temperature for sensible heating.");
  }

  const specificEnergyKjPerKg =
    (specificHeatJPerKgK * (outletTemperatureC - inletTemperatureC)) / 1000;
  if (!Number.isFinite(specificEnergyKjPerKg) || specificEnergyKjPerKg <= 0) {
    throw new Error("Calculated specific energy must be finite and positive.");
  }
  return { specificEnergyKjPerKg };
}

/**
 * Calculate steady-state sensible heat duty. kg/s × kJ/kg = kJ/s = kW.
 */
export function calculateSensibleHeatDuty(
  massFlowKgPerS: number,
  specificEnergyKjPerKg: number
): SensibleHeatDutyResult {
  if (!Number.isFinite(massFlowKgPerS) || !Number.isFinite(specificEnergyKjPerKg)) {
    throw new Error("Mass flow and specific energy must be finite.");
  }
  if (massFlowKgPerS <= 0 || specificEnergyKjPerKg <= 0) {
    throw new Error("Mass flow and specific energy must be positive.");
  }
  const heatDutyKw = massFlowKgPerS * specificEnergyKjPerKg;
  if (!Number.isFinite(heatDutyKw) || heatDutyKw <= 0) {
    throw new Error("Calculated heat duty must be finite and positive.");
  }
  return { heatDutyKw };
}
