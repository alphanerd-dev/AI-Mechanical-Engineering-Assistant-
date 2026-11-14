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

interface RootContext {
  value: Record<string, unknown>;
  errors: string[];
}

interface ValueContext {
  value: unknown;
  errors: string[];
  message: string;
}

interface ArtifactContext {
  value: Record<string, unknown>;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validDate(value: unknown): value is string {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function requireValue(context: ValueContext): void {
  if (!context.value) context.errors.push(context.message);
}

function requireUuid(context: ValueContext): void {
  requireValue({
    value: typeof context.value === "string" && UUID.test(context.value),
    errors: context.errors,
    message: context.message
  });
}

function validateIdentity(context: RootContext): void {
  const value = context.value;
  requireValue({
    value: value.schemaVersion === GEOMETRY_REVISION_SCHEMA_VERSION,
    errors: context.errors,
    message: "Unsupported geometry revision schema version."
  });
  requireUuid({ value: value.geometryRevisionId, errors: context.errors, message: "geometryRevisionId must be a UUID." });
  requireUuid({ value: value.projectId, errors: context.errors, message: "projectId must be a UUID." });
  requireUuid({ value: value.modelIdentityId, errors: context.errors, message: "modelIdentityId must be a UUID." });
  requireUuid({ value: value.sourceCompletionId, errors: context.errors, message: "sourceCompletionId must be a UUID." });
}

function validateRevisionNumber(context: RootContext): void {
  const value = context.value.geometryRevisionNumber;
  requireValue({
    value: Number.isSafeInteger(value) && (value as number) >= 1,
    errors: context.errors,
    message: "geometryRevisionNumber must be a positive safe integer."
  });
}

function validateParentIdentifier(context: RootContext): void {
  const parent = context.value.parentGeometryRevisionId;
  requireValue({
    value: parent === null || (typeof parent === "string" && UUID.test(parent)),
    errors: context.errors,
    message: "parentGeometryRevisionId must be null or a UUID."
  });
}

function validateParentSequence(context: RootContext): void {
  const number = context.value.geometryRevisionNumber;
  const parent = context.value.parentGeometryRevisionId;
  requireValue({
    value: number !== 1 || parent === null,
    errors: context.errors,
    message: "The first geometry revision must not have a parent."
  });
  requireValue({
    value: typeof number !== "number" || number <= 1 || parent !== null,
    errors: context.errors,
    message: "Geometry revisions after the first must identify their parent."
  });
}

function validateLineage(context: RootContext): void {
  validateRevisionNumber(context);
  validateParentIdentifier(context);
  validateParentSequence(context);
}

function validateSourceOperation(context: RootContext): void {
  requireValue({
    value: nonEmptyString(context.value.sourceOperationId, 128),
    errors: context.errors,
    message: "sourceOperationId is required."
  });
}

function validateStorageBucket(context: RootContext): void {
  requireValue({
    value: context.value.storageBucket === GEOMETRY_REVISION_STORAGE_BUCKET,
    errors: context.errors,
    message: "storageBucket must be the canonical private CAD artifact bucket."
  });
}

function validateStorageObject(context: RootContext): void {
  const value = context.value;
  const expected = [value.projectId, value.modelIdentityId, value.sourceOperationId, "solid.brep"].join("/");
  requireValue({
    value: value.storageObjectName === expected,
    errors: context.errors,
    message: "storageObjectName must identify the exact source completion BREP object."
  });
}

function validateStorage(context: RootContext): void {
  validateSourceOperation(context);
  validateStorageBucket(context);
  validateStorageObject(context);
}

function validateArtifactId(context: ArtifactContext): void {
  requireValue({
    value: nonEmptyString(context.value.artifactId, 160),
    errors: context.errors,
    message: "canonicalArtifact.artifactId is required."
  });
}

function validateArtifactKind(context: ArtifactContext): void {
  requireValue({
    value: context.value.artifactKind === "SOLID",
    errors: context.errors,
    message: "canonicalArtifact.artifactKind must be SOLID."
  });
}

function validateArtifactFormat(context: ArtifactContext): void {
  requireValue({
    value: context.value.format === "BREP",
    errors: context.errors,
    message: "canonicalArtifact.format must be BREP."
  });
}

function validateArtifactDigest(context: ArtifactContext): void {
  requireValue({
    value: typeof context.value.artifactSha256 === "string" && SHA256.test(context.value.artifactSha256),
    errors: context.errors,
    message: "canonicalArtifact.artifactSha256 must be a lowercase SHA-256 digest."
  });
}

function validateArtifactUnits(context: ArtifactContext): void {
  requireValue({
    value: context.value.units === "mm",
    errors: context.errors,
    message: "canonicalArtifact.units must be mm."
  });
}

function validateCoordinateFrame(context: ArtifactContext): void {
  requireValue({
    value: context.value.coordinateFrameId === "WORLD_Z_AXIS",
    errors: context.errors,
    message: "canonicalArtifact.coordinateFrameId must be WORLD_Z_AXIS."
  });
}

function validateCanonicalArtifact(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("canonicalArtifact must be an object.");
    return;
  }
  const context = { value, errors };
  validateArtifactId(context);
  validateArtifactKind(context);
  validateArtifactFormat(context);
  validateArtifactDigest(context);
  validateArtifactUnits(context);
  validateCoordinateFrame(context);
}

function validateProviderId(context: ArtifactContext): void {
  requireValue({
    value: nonEmptyString(context.value.providerId, 128),
    errors: context.errors,
    message: "provider.providerId is required."
  });
}

function validateProviderVersion(context: ArtifactContext): void {
  requireValue({
    value: nonEmptyString(context.value.providerVersion, 128),
    errors: context.errors,
    message: "provider.providerVersion is required."
  });
}

function validateExecutionBackend(context: ArtifactContext): void {
  const backend = context.value.executionBackend;
  requireValue({
    value: backend === "build123d" || backend === "cadquery",
    errors: context.errors,
    message: "provider.executionBackend is unsupported."
  });
}

function validateProvider(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("provider must be an object.");
    return;
  }
  const context = { value, errors };
  validateProviderId(context);
  validateProviderVersion(context);
  validateExecutionBackend(context);
}

function validateCreatedAt(context: RootContext): void {
  requireValue({
    value: validDate(context.value.createdAt),
    errors: context.errors,
    message: "createdAt must be a valid date string."
  });
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

  const context = { value, errors: [] as string[] };
  validateIdentity(context);
  validateLineage(context);
  validateStorage(context);
  validateCanonicalArtifact(value.canonicalArtifact, context.errors);
  validateProvider(value.provider, context.errors);
  validateCreatedAt(context);

  return { status: context.errors.length ? "FAIL" : "PASS", errors: context.errors };
}
