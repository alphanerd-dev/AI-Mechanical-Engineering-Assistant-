export const GEOMETRY_REVISION_SCHEMA_VERSION = 1 as const;
export const GEOMETRY_REVISION_STORAGE_BUCKET = "engineering-cad-artifacts" as const;

export type GeometryCanonicalFormat = "BREP";
export type GeometryExecutionBackend = "build123d" | "cadquery";

export interface GeometryRevisionV1 {
  schemaVersion: typeof GEOMETRY_REVISION_SCHEMA_VERSION;
  geometryRevisionId: string;
  projectId: string;
  modelIdentityId: string;
  geometryRevisionNumber: number;
  parentGeometryRevisionId: string | null;
  sourceCompletionId: string;
  sourceOperationId: string;
  storageBucket: typeof GEOMETRY_REVISION_STORAGE_BUCKET;
  storageObjectName: string;
  canonicalArtifact: {
    artifactId: string;
    artifactKind: "SOLID";
    format: GeometryCanonicalFormat;
    artifactSha256: string;
    units: "mm";
    coordinateFrameId: "WORLD_Z_AXIS";
  };
  provider: {
    providerId: string;
    providerVersion: string;
    executionBackend: GeometryExecutionBackend;
  };
  createdAt: string;
}

export interface GeometryRevisionValidation {
  status: "PASS" | "FAIL";
  errors: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validDate(value: unknown): value is string {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Validates a persisted geometry revision contract. It does not establish that
 * the referenced Storage bytes exist or that their digest is correct; the
 * trusted persistence service must download and hash those exact bytes.
 */
export function validateGeometryRevisionV1(value: unknown): GeometryRevisionValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { status: "FAIL", errors: ["Geometry revision must be an object."] };
  }

  if (value.schemaVersion !== GEOMETRY_REVISION_SCHEMA_VERSION) {
    errors.push("Unsupported geometry revision schema version.");
  }

  for (const key of ["geometryRevisionId", "projectId", "modelIdentityId", "sourceCompletionId"] as const) {
    if (typeof value[key] !== "string" || !UUID.test(value[key] as string)) {
      errors.push(key + " must be a UUID.");
    }
  }

  if (!Number.isSafeInteger(value.geometryRevisionNumber) || (value.geometryRevisionNumber as number) < 1) {
    errors.push("geometryRevisionNumber must be a positive safe integer.");
  }

  const parent = value.parentGeometryRevisionId;
  if (parent !== null && (typeof parent !== "string" || !UUID.test(parent))) {
    errors.push("parentGeometryRevisionId must be null or a UUID.");
  }
  if (value.geometryRevisionNumber === 1 && parent !== null) {
    errors.push("The first geometry revision must not have a parent.");
  }
  if (typeof value.geometryRevisionNumber === "number" && value.geometryRevisionNumber > 1 && parent === null) {
    errors.push("Geometry revisions after the first must identify their parent.");
  }

  if (!nonEmptyString(value.sourceOperationId, 128)) errors.push("sourceOperationId is required.");
  if (value.storageBucket !== GEOMETRY_REVISION_STORAGE_BUCKET) {
    errors.push("storageBucket must be the canonical private CAD artifact bucket.");
  }
  const expectedPath = typeof value.projectId === "string" &&
    typeof value.modelIdentityId === "string" &&
    typeof value.sourceOperationId === "string"
      ? value.projectId + "/" + value.modelIdentityId + "/" + value.sourceOperationId + "/solid.brep"
      : "";
  if (value.storageObjectName !== expectedPath) {
    errors.push("storageObjectName must identify the exact source completion BREP object.");
  }

  if (!isRecord(value.canonicalArtifact)) {
    errors.push("canonicalArtifact must be an object.");
  } else {
    if (!nonEmptyString(value.canonicalArtifact.artifactId, 160)) errors.push("canonicalArtifact.artifactId is required.");
    if (value.canonicalArtifact.artifactKind !== "SOLID") errors.push("canonicalArtifact.artifactKind must be SOLID.");
    if (value.canonicalArtifact.format !== "BREP") errors.push("canonicalArtifact.format must be BREP.");
    if (typeof value.canonicalArtifact.artifactSha256 !== "string" || !SHA256.test(value.canonicalArtifact.artifactSha256)) {
      errors.push("canonicalArtifact.artifactSha256 must be a lowercase SHA-256 digest.");
    }
    if (value.canonicalArtifact.units !== "mm") errors.push("canonicalArtifact.units must be mm.");
    if (value.canonicalArtifact.coordinateFrameId !== "WORLD_Z_AXIS") {
      errors.push("canonicalArtifact.coordinateFrameId must be WORLD_Z_AXIS.");
    }
  }

  if (!isRecord(value.provider)) {
    errors.push("provider must be an object.");
  } else {
    if (!nonEmptyString(value.provider.providerId, 128)) errors.push("provider.providerId is required.");
    if (!nonEmptyString(value.provider.providerVersion, 128)) errors.push("provider.providerVersion is required.");
    if (value.provider.executionBackend !== "build123d" && value.provider.executionBackend !== "cadquery") {
      errors.push("provider.executionBackend is unsupported.");
    }
  }

  if (!validDate(value.createdAt)) errors.push("createdAt must be a valid date string.");
  return { status: errors.length ? "FAIL" : "PASS", errors };
}
