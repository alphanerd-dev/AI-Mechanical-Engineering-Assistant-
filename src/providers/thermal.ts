import { CapabilityProvider } from "../capabilities/registry.js";
import { CapabilityRequest, CapabilityResult } from "../core/types.js";
import {
  calculateSensibleHeatDuty,
  calculateSensibleSpecificEnergy
} from "../engineering/thermal.js";

export class ThermalAnalysisProvider implements CapabilityProvider {
  id = "thermal-analysis";
  capabilities = [
    "ANALYSIS.SENSIBLE_SPECIFIC_ENERGY",
    "ANALYSIS.SENSIBLE_HEAT_DUTY"
  ];

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    try {
      if (request.capability === "ANALYSIS.SENSIBLE_SPECIFIC_ENERGY") {
        const { specificHeatJPerKgK, inletTemperatureC, outletTemperatureC } =
          request.input as {
            specificHeatJPerKgK: number;
            inletTemperatureC: number;
            outletTemperatureC: number;
          };
        return {
          capability: request.capability,
          provider: this.id,
          success: true,
          output: calculateSensibleSpecificEnergy(
            specificHeatJPerKgK,
            inletTemperatureC,
            outletTemperatureC
          )
        };
      }
      if (request.capability === "ANALYSIS.SENSIBLE_HEAT_DUTY") {
        const { massFlowKgPerS, specificEnergyKjPerKg } = request.input as {
          massFlowKgPerS: number;
          specificEnergyKjPerKg: number;
        };
        return {
          capability: request.capability,
          provider: this.id,
          success: true,
          output: calculateSensibleHeatDuty(massFlowKgPerS, specificEnergyKjPerKg)
        };
      }
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: "Unsupported thermal analysis capability."
      };
    } catch (error) {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: error instanceof Error ? error.message : "Thermal calculation failed."
      };
    }
  }
}
