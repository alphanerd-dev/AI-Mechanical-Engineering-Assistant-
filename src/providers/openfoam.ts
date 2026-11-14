import { CapabilityRequest, CapabilityResult } from "../core/types.js";
import {
  OpenFOAMLaminarChannelRequest,
  OpenFOAMLaminarChannelResult
} from "../cfd/types.js";
import {
  validateOpenFOAMLaminarChannelRequest,
  validateOpenFOAMLaminarChannelResult
} from "../cfd/validation.js";
import { EngineeringProvider, ProviderDescriptor } from "./contracts.js";

export interface OpenFOAMExecutor {
  runLaminarChannel(request: OpenFOAMLaminarChannelRequest): Promise<OpenFOAMLaminarChannelResult>;
  downloadArtifact?(jobId: string, filename: string): Promise<Uint8Array>;
}

export class OpenFOAMProvider implements EngineeringProvider {
  readonly id = "simulation.openfoam";
  readonly capabilities = ["ANALYSIS.CFD_LAMINAR_CHANNEL"];
  readonly descriptor: ProviderDescriptor = {
    id: this.id,
    domain: "fluids",
    status: "EXPERIMENTAL",
    version: "0.1",
    capabilities: this.capabilities,
    requires: ["Isolated OpenFOAM 14 worker"]
  };

  constructor(private readonly executor?: OpenFOAMExecutor) {}

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    if (request.capability !== "ANALYSIS.CFD_LAMINAR_CHANNEL") {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: "Unsupported OpenFOAM capability."
      };
    }

    const inputErrors = validateOpenFOAMLaminarChannelRequest(request.input);
    if (inputErrors.length) {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: inputErrors.join("; ")
      };
    }

    const input = request.input as unknown as OpenFOAMLaminarChannelRequest;
    if (!this.executor) {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        output: {
          status: "UNAVAILABLE",
          caseId: input.caseId,
          solver: "OpenFOAM",
          solverVersion: "14"
        },
        error: "OpenFOAM 14 worker is not configured. No CFD solver was executed."
      };
    }

    try {
      const result = await this.executor.runLaminarChannel(input);
      const validation = validateOpenFOAMLaminarChannelResult(input, result);
      return {
        capability: request.capability,
        provider: this.id,
        success: validation.status === "PASS",
        output: { result, validation }
      };
    } catch (error) {
      return {
        capability: request.capability,
        provider: this.id,
        success: false,
        error: error instanceof Error ? error.message : "OpenFOAM worker execution failed."
      };
    }
  }
}
