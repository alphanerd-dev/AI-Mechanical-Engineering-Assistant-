import { CapabilityRouter } from "../capabilities/router.js";
import { EngineeringCompletionReport, EngineeringCompletionUnit, EngineeringCompletionUnitRequest } from "./types.js";

export class SensibleHeatingEngineeringCompletionUnit implements EngineeringCompletionUnit {
  id = "ENGINEERING.COMPLETE_SENSIBLE_HEATING";
  capability = "ENGINEERING.COMPLETE_SENSIBLE_HEATING";
  requiredInputs = [
    { key: "massFlowKgPerS", label: "mass flow rate" },
    { key: "specificHeatJPerKgK", label: "specific heat capacity" },
    { key: "inletTemperatureC", label: "inlet temperature" },
    { key: "outletTemperatureC", label: "outlet temperature" },
    { key: "maximumHeatDutyKw", label: "maximum heat duty" }
  ];

  async execute(
    request: EngineeringCompletionUnitRequest,
    router: CapabilityRouter
  ): Promise<EngineeringCompletionReport> {
    const result = await router.execute({
      capability: this.capability,
      risk: "HIGH",
      input: {
        projectId: request.projectId,
        ...request.inputs,
        ...(request.approval ? { approval: request.approval } : {})
      }
    });
    if (!result.output) {
      throw new Error(result.error ?? "Sensible heating completion unit returned no report.");
    }
    return result.output as EngineeringCompletionReport;
  }
}
