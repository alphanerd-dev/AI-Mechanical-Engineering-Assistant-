import type { CADPartCompletionResult } from "../cad/completion.js";
import { CADPartCompletionWorkflow } from "../cad/completion.js";
import type {
  GeometryArtifactReference,
  GeometryOperationProvider,
  GeometryOperationRequest,
  GeometryOperationResult,
  GeometryOperationStatus
} from "./contracts.js";

const PROVIDER_ID = "geometry-platform.cad-completion";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRequest(request: GeometryOperationRequest): string[] {
  const errors: string[] = [];
  if (!request || typeof request !== "object") return ["Geometry operation request must be an object."];
  if (request.operation !== "geometry.create_cylinder") errors.push("Operation is not supported by this adapter.");
  if (!nonEmpty(request.operationId)) errors.push("operationId is required.");
  if (!nonEmpty(request.context?.projectId)) errors.push("A server-resolved projectId is required.");
  if (request.context?.units !== "mm") errors.push("This adapter currently accepts millimetres only.");
  if (request.context?.coordinateFrame !== "WORLD_Z_AXIS") errors.push("This adapter currently supports the world frame with the cylinder axis on +Z only.");
  if (!Number.isFinite(request.parameters?.diameter) || request.parameters.diameter <= 0) {
    errors.push("diameter must be a finite positive number in millimetres.");
  }
  if (!Number.isFinite(request.parameters?.length) || request.parameters.length <= 0) {
    errors.push("length must be a finite positive number in millimetres.");
  }
  if (request.parameters?.name !== undefined &&
      request.parameters.name !== "shaft" && request.parameters.name !== "cylinder") {
    errors.push("name must be shaft or cylinder.");
  }
  return errors;
}

function mapStatus(result: CADPartCompletionResult): GeometryOperationStatus {
  switch (result.status) {
    case "ACCEPTED": return "SUCCEEDED";
    case "BLOCKED": return "BLOCKED";
    case "INCOMPLETE": return "INCOMPLETE";
    case "NEEDS_INPUT": return "NEEDS_INPUT";
    case "UNSUPPORTED": return "UNSUPPORTED";
    case "REJECTED":
    case "FAILED": return "FAILED";
  }
}

function artifactReferences(result: CADPartCompletionResult): GeometryArtifactReference[] {
  return (result.manifest?.artifacts ?? []).map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    ...(artifact.uri ? { uri: artifact.uri } : {}),
    backend: artifact.backend,
    validationStatus: artifact.validationStatus,
    ...(artifact.provenance?.artifactSha256
      ? { sha256: artifact.provenance.artifactSha256 }
      : {})
  }));
}

/**
 * Thin geometry-platform facade over the proven bounded CAD completion workflow.
 * It does not own execution, validation, artifact persistence or CAD runtimes.
 */
export class CADCompletionGeometryProvider implements GeometryOperationProvider {
  readonly id = PROVIDER_ID;
  readonly supportedOperations = ["geometry.create_cylinder"] as const;

  constructor(private readonly workflow: CADPartCompletionWorkflow) {}

  async execute(request: GeometryOperationRequest): Promise<GeometryOperationResult> {
    const errors = validateRequest(request);
    if (errors.length) {
      return {
        schemaVersion: 1,
        operationId: nonEmpty(request?.operationId) ? request.operationId : "invalid-request",
        operation: "geometry.create_cylinder",
        providerId: this.id,
        status: "FAILED",
        workflowStatus: "NOT_STARTED",
        stage: "REQUEST_VALIDATION",
        artifacts: [],
        errors,
        warnings: []
      };
    }

    const name = request.parameters.name ?? "cylinder";
    const workflowResult = await this.workflow.complete({
      projectId: request.context.projectId,
      modelIdentity: request.context.modelIdentity,
      rawIntent: `Create a ${name} with diameter ${request.parameters.diameter} mm and length ${request.parameters.length} mm.`
    });

    return this.normalize(request, workflowResult);
  }

  private normalize(
    request: GeometryOperationRequest,
    result: CADPartCompletionResult
  ): GeometryOperationResult {
    return {
      schemaVersion: 1,
      operationId: request.operationId,
      operation: request.operation,
      providerId: this.id,
      status: mapStatus(result),
      workflowStatus: result.status,
      stage: result.stage,
      ...(result.execution?.selectedProviderId
        ? { executionProviderId: result.execution.selectedProviderId }
        : {}),
      ...(result.validation?.selectedProviderId
        ? { validationProviderId: result.validation.selectedProviderId }
        : {}),
      artifacts: artifactReferences(result),
      errors: [...result.errors],
      warnings: [...result.warnings]
    };
  }
}
