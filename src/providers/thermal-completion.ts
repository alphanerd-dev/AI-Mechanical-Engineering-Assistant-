import { CapabilityProvider } from "../capabilities/registry.js";
import { CapabilityRequest, CapabilityResult } from "../core/types.js";
import { CapabilityRouter } from "../capabilities/router.js";
import { completeSensibleHeatingUnit, SensibleHeatingCompletionRequest } from "../completion/thermal.js";

export class ThermalEngineeringCompletionProvider implements CapabilityProvider {
  id = "thermal-engineering-completion";
  capabilities = ["ENGINEERING.COMPLETE_SENSIBLE_HEATING"];

  constructor(private readonly router: CapabilityRouter) {}

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    if (request.capability !== "ENGINEERING.COMPLETE_SENSIBLE_HEATING") {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: "Unsupported thermal completion capability."
      };
    }
    try {
      const report = await completeSensibleHeatingUnit(
        request.input as unknown as SensibleHeatingCompletionRequest,
        this.router
      );
      const accepted = report.status === "COMPLETE" ||
        report.status === "WAITING_APPROVAL" ||
        report.status === "BLOCKED";
      return {
        capability: request.capability,
        provider: this.id,
        success: accepted,
        output: report,
        error: report.status === "FAILED" ? report.nextAction : undefined,
        evidenceIds: report.lineage.evidenceIds,
        artifactIds: report.lineage.artifactIds
      };
    } catch (error) {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: error instanceof Error ? error.message : "Thermal completion failed."
      };
    }
  }
}
