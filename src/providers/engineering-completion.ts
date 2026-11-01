import { CapabilityProvider } from "../capabilities/registry.js";
import { CapabilityRequest, CapabilityResult } from "../core/types.js";
import { CapabilityRouter } from "../capabilities/router.js";
import { ShaftEngineeringCompletionUnit } from "../completion/shaft-unit.js";

export class EngineeringCompletionProvider implements CapabilityProvider {
  id = "engineering-completion";
  capabilities = ["ENGINEERING.COMPLETE_SHAFT"];

  constructor(private readonly router: CapabilityRouter) {}

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    if (request.capability !== "ENGINEERING.COMPLETE_SHAFT") {
      return { capability: request.capability, provider: this.id, success: false, error: "Unsupported engineering completion capability." };
    }
    const { projectId, approval, ...inputs } = request.input as Record<string, unknown>;
    if (typeof projectId !== "string" || !projectId.trim()) {
      return { capability: request.capability, provider: this.id, success: false, error: "projectId is required." };
    }
    try {
      const report = await new ShaftEngineeringCompletionUnit().execute({
        projectId,
        inputs: inputs as Record<string, number | string>,
        ...(approval && typeof approval === "object" ? { approval: approval as never } : {})
      }, this.router);
      return {
        capability: request.capability,
        provider: this.id,
        success: report.status !== "FAILED",
        output: report,
        error: report.status === "FAILED" ? report.nextAction : undefined,
        artifactIds: report.lineage.artifactIds
      };
    } catch (error) {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: error instanceof Error ? error.message : "Engineering completion failed."
      };
    }
  }
}
