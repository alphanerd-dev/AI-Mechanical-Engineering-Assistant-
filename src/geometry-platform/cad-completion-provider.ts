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

function validateOperation(request: GeometryOperationRequest): string[] {
  return request.operation === "geometry.create_cylinder"
    ? []
    : ["Operation is not supported by this adapter."];
}

function validateOperationId(request: GeometryOperationRequest): string[] {
  return nonEmpty(request.operationId) ? [] : ["operationId is required."];
}

function validateUnits(request: GeometryOperationRequest): string[] {
  return request.context?.units === "mm" ? [] : ["This adapter currently accepts millimetres only."];
}

function validateCoordinateFrame(request: GeometryOperationRequest): string[] {
  return request.context?.coordinateFrame === "WORLD_Z_AXIS"
    ? []
    : ["This adapter currently supports the world frame with the cylinder axis on +Z only."];
}

function validateTolerancePolicy(request: GeometryOperationRequest): string[] {
  return request.context?.tolerancePolicyId === "CYLINDER_DIMENSION_0_01_MM"
    ? []
    : ["This adapter requires its host-controlled 0.01 mm cylinder dimension tolerance policy."];
}

function validateContext(request: GeometryOperationRequest): string[] {
  const errors: string[] = [];
  if (!nonEmpty(request.context?.projectId)) errors.push("A server-resolved projectId is required.");
  errors.push(...validateUnits(request), ...validateCoordinateFrame(request), ...validateTolerancePolicy(request));
  return errors;
}

function validatePositiveDimension(value: unknown, name: string): string[] {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? []
    : [name + " must be a finite positive number in millimetres."];
}

function validateDimensions(request: GeometryOperationRequest): string[] {
  return [
    ...validatePositiveDimension(request.parameters?.diameter, "diameter"),
    ...validatePositiveDimension(request.parameters?.length, "length")
  ];
}

function validateOptionalName(request: GeometryOperationRequest): string[] {
  const name = request.parameters?.name;
  if (name === undefined) return [];
  if (name === "shaft") return [];
  if (name === "cylinder") return [];
  return ["name must be shaft or cylinder."];
}

function validateRequest(request: GeometryOperationRequest): string[] {
  if (!request || typeof request !== "object") {
    return ["Geometry operation request must be an object."];
  }
  return [
    ...validateOperation(request),
    ...validateOperationId(request),
    ...validateContext(request),
    ...validateDimensions(request),
    ...validateOptionalName(request)
  ];
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
        evidenceIds: [],
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
      evidenceIds: result.bundle ? [result.bundle.evidence.id] : [],
      ...(result.bundle ? { engineeringArtifactId: result.bundle.engineering.id } : {}),
      ...(result.acceptance ? { acceptanceStatus: result.acceptance.status } : {}),
      errors: [...result.errors],
      warnings: [...result.warnings]
    };
  }
}
