import type { CADModelIdentity } from "../cad/identity.js";

export const GEOMETRY_PLATFORM_SCHEMA_VERSION = 1 as const;

/** The first adapter deliberately supports only the existing millimetre/Z-axis CAD convention. */
export type GeometryUnitSystem = "mm";
export type GeometryCoordinateFrame = "WORLD_Z_AXIS";

export interface GeometryOperationContext {
  projectId: string;
  modelIdentity: CADModelIdentity;
  units: GeometryUnitSystem;
  coordinateFrame: GeometryCoordinateFrame;
}

export interface CreateCylinderOperation {
  operation: "geometry.create_cylinder";
  operationId: string;
  context: GeometryOperationContext;
  parameters: {
    name?: "shaft" | "cylinder";
    diameter: number;
    length: number;
  };
}

export type GeometryOperationRequest = CreateCylinderOperation;

export type GeometryOperationStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "BLOCKED"
  | "INCOMPLETE"
  | "NEEDS_INPUT"
  | "UNSUPPORTED";

export interface GeometryArtifactReference {
  id: string;
  kind: string;
  uri?: string;
  backend: string;
  validationStatus: "UNVALIDATED" | "PASS" | "FAIL";
  sha256?: string;
}

export interface GeometryOperationResult {
  schemaVersion: typeof GEOMETRY_PLATFORM_SCHEMA_VERSION;
  operationId: string;
  operation: GeometryOperationRequest["operation"];
  providerId: string;
  status: GeometryOperationStatus;
  workflowStatus: string;
  stage: string;
  executionProviderId?: string;
  validationProviderId?: string;
  artifacts: GeometryArtifactReference[];
  errors: string[];
  warnings: string[];
}

/** Provider contract is intentionally small; capability discovery is explicit. */
export interface GeometryOperationProvider {
  readonly id: string;
  readonly supportedOperations: readonly GeometryOperationRequest["operation"][];
  execute(request: GeometryOperationRequest): Promise<GeometryOperationResult>;
}
