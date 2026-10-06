import { ExecutionBackendAdapter } from "./executor";
import { ExecutionRequest, ExecutionResult } from "./types";
import { shaftTorque } from "../engineering/calculations";

export class SafeNumericalAdapter implements ExecutionBackendAdapter {
  readonly id = "execution.typescript-safe";

  canExecute(request: ExecutionRequest): boolean {
    return request.backend === "typescript-safe" && request.capability === "ANALYSIS.SHAFT_TORQUE";
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const powerKw = Number(request.inputs.powerKw);
    const speedRpm = Number(request.inputs.speedRpm);
    const result = shaftTorque(powerKw, speedRpm);

    return {
      success: true,
      outputs: {
        ...result,
        torque: { value: result.torqueNm, unit: "N·m" },
      },
      warnings: ["This is a deterministic TypeScript calculation adapter, not arbitrary Python execution."],
      artifactIds: [],
    };
  }
}
