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

function requireValue(valid: boolean, message: string, errors: string[]): void {
  if (!valid) errors.push(message);
}

function requireUuid(value: unknown, field: string, errors: string[]): void {
  requireValue(typeof value === "string" && UUID.test(value), field + " must be a UUID.", errors);
}

function validateIdentity(value: Record<string, unknown>, errors: string[]): void {
  requireValue(value.schemaVersion === GEOMETRY_REVISION_SCHEMA_VERSION, "Unsupported geometry revision schema version.", errors);
  requireUuid(value.geometryRevisionId, "geometryRevisionId", errors);
  requireUuid(value.projectId, "projectId", errors);
  requireUuid(value.modelIdentityId, "modelIdentityId", errors);
  requireUuid(value.sourceCompletionId, "sourceCompletionId", errors);
}

function validateRevisionNumber(value: unknown, errors: string[]): void {
  requireValue(Number.isSafeInteger(value) && (value as number) >= 1,
    "geometryRevisionNumber must be a positive safe integer.", errors);
}

function validateParentIdentifier(parent: unknown, errors: string[]): void {
  requireValue(parent === null || (typeof parent === "string" && UUID.test(parent)),
    "parentGeometryRevisionId must be null or a UUID.", errors);
}

function validateParentSequence(number: unknown, parent: unknown, errors: string[]): void {
  requireValue(number !== 1 || parent === null,
    "The first geometry revision must not have a parent.", errors);
  requireValue(typeof number !== "number" || number <= 1 || parent !== null,
    "Geometry revisions after the first must identify their parent.", errors);
}

function validateLineage(value: Record<string, unknown>, errors: string[]): void {
  validateRevisionNumber(value.geometryRevisionNumber, errors);
  validateParentIdentifier(value.parentGeometryRevisionId, errors);
  validateParentSequence(value.geometryRevisionNumber, value.parentGeometryRevisionId, errors);
}

function validateSourceOperation(value: unknown, errors: string[]): void {
  requireValue(nonEmptyString(value, 128), "sourceOperationId is required.", errors);
}

function validateStorageBucket(value: unknown, errors: string[]): void {
  requireValue(value === GEOMETRY_REVISION_STORAGE_BUCKET,
    "storageBucket must be the canonical private CAD artifact bucket.", errors);
}

function expectedStoragePath(value: Record<string, unknown>): string {
  return [value.projectId, value.modelIdentityId, value.sourceOperationId, "solid.brep"].join("/");
}

function validateStorageObject(value: Record<string, unknown>, errors: string[]): void {
  requireValue(value.storageObjectName === expectedStoragePath(value),
    "storageObjectName must identify the exact source completion BREP object.", errors);
}

function validateStorage(value: Record<string, unknown>, errors: string[]): void {
  validateSourceOperation(value.sourceOperationId, errors);
  validateStorageBucket(value.storageBucket, errors);
  validateStorageObject(value, errors);
}

function requireArtifactId(value: unknown, errors: string[]): void {
  requireValue(nonEmptyString(value, 160), "canonicalArtifact.artifactId is required.", errors);
}

function requireArtifactKind(value: unknown, errors: string[]): void {
  requireValue(value === "SOLID", "canonicalArtifact.artifactKind must be SOLID.", errors);
}

function requireArtifactFormat(value: unknown, errors: string[]): void {
  requireValue(value === "BREP", "canonicalArtifact.format must be BREP.", errors);
}

function requireArtifactDigest(value: unknown, errors: string[]): void {
  requireValue(typeof value === "string" && SHA256.test(value),
    "canonicalArtifact.artifactSha256 must be a lowercase SHA-256 digest.", errors);
}

function requireArtifactUnits(value: unknown, errors: string[]): void {
  requireValue(value === "mm", "canonicalArtifact.units must be mm.", errors);
}

function requireCoordinateFrame(value: unknown, errors: string[]): void {
  requireValue(value === "WORLD_Z_AXIS",
    "canonicalArtifact.coordinateFrameId must be WORLD_Z_AXIS.", errors);
}

function validateCanonicalArtifact(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("canonicalArtifact must be an object.");
    return;
  }
  requireArtifactId(value.artifactId, errors);
  requireArtifactKind(value.artifactKind, errors);
  requireArtifactFormat(value.format, errors);
  requireArtifactDigest(value.artifactSha256, errors);
  requireArtifactUnits(value.units, errors);
  requireCoordinateFrame(value.coordinateFrameId, errors);
}

function requireProviderId(value: unknown, errors: string[]): void {
  requireValue(nonEmptyString(value, 128), "provider.providerId is required.", errors);
}

function requireProviderVersion(value: unknown, errors: string[]): void {
  requireValue(nonEmptyString(value, 128), "provider.providerVersion is required.", errors);
}

function requireExecutionBackend(value: unknown, errors: string[]): void {
  requireValue(value === "build123d" || value === "cadquery",
    "provider.executionBackend is unsupported.", errors);
}

function validateProvider(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("provider must be an object.");
    return;
  }
  requireProviderId(value.providerId, errors);
  requireProviderVersion(value.providerVersion, errors);
  requireExecutionBackend(value.executionBackend, errors);
}

function validateCreatedAt(value: unknown, errors: string[]): void {
  requireValue(validDate(value), "createdAt must be a valid date string.", errors);
}

/**
 * Validates a persisted geometry revision contract. It does not establish that
 * the referenced Storage bytes exist or that their digest is correct; the
 * trusted persistence service must download and hash those exact bytes.
 */
export function validateGeometryRevisionV1(value: unknown): GeometryRevisionValidation {
  if (!isRecord(value)) {
    return { status: "FAIL", errors: ["Geometry revision must be an object."] };
  }

  const errors: string[] = [];
  validateIdentity(value, errors);
  validateLineage(value, errors);
  validateStorage(value, errors);
  validateCanonicalArtifact(value.canonicalArtifact, errors);
  validateProvider(value.provider, errors);
  validateCreatedAt(value.createdAt, errors);

  return { status: errors.length ? "FAIL" : "PASS", errors };
}
