/**
 * Product-owned geometry-kernel seam.
 *
 * The currently deployed OCCT process is a BREP validator, not a general STEP/BREP
 * import, topology-query or tessellation service. Do not register an OCCT adapter
 * until every method below has a real, isolated worker implementation.
 */
export type CADGeometryInputFormat = "BREP" | "STEP";
export type CADGeometryOperationStatus = "COMPLETED" | "UNSUPPORTED" | "FAILED";

export interface CADGeometrySource {
  artifactId: string;
  modelIdentityId: string;
  modelRevision: number;
  format: CADGeometryInputFormat;
  sha256: string;
  bytes: Uint8Array;
  units: string;
  coordinateFrame: string;
}

export interface CADGeometryTopologySummary {
  solids: number;
  shells: number;
  faces: number;
  edges: number;
  vertices: number;
  valid: boolean;
}

export interface CADGeometryTessellation {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  linearDeflectionMm: number;
  angularDeflectionRad: number;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  providerId: string;
  providerVersion: string;
}

export interface CADGeometryResult<T> {
  status: CADGeometryOperationStatus;
  value?: T;
  errors: string[];
  limitations: string[];
}

export interface CADGeometryKernelAdapter {
  readonly providerId: string;
  readonly providerVersion: string;
  inspect(source: CADGeometrySource): Promise<CADGeometryResult<CADGeometryTopologySummary>>;
  tessellate(source: CADGeometrySource, options: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }): Promise<CADGeometryResult<CADGeometryTessellation>>;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function validateRequiredTextFields(source: UnknownRecord): string[] {
  return ["artifactId", "modelIdentityId", "units", "coordinateFrame"]
    .filter((key) => typeof source[key] !== "string" || !(source[key] as string).trim())
    .map((key) => key + " is required.");
}

function validateModelRevision(source: UnknownRecord): string[] {
  const revision = source.modelRevision;
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 1
    ? []
    : ["modelRevision must be a positive safe integer."];
}

function validateGeometryFormat(source: UnknownRecord): string[] {
  return source.format === "BREP" || source.format === "STEP"
    ? []
    : ["Geometry source format is unsupported."];
}

function validateIdentityFields(source: UnknownRecord): string[] {
  return [
    ...validateRequiredTextFields(source),
    ...validateModelRevision(source),
    ...validateGeometryFormat(source)
  ];
}

function validateDigest(source: UnknownRecord): string[] {
  return typeof source.sha256 === "string" && /^[a-f0-9]{64}$/.test(source.sha256)
    ? []
    : ["sha256 must be a lowercase SHA-256 digest."];
}

function validateSourceBytes(source: UnknownRecord): string[] {
  const bytes = source.bytes;
  if (bytes instanceof Uint8Array && bytes.byteLength >= 1 && bytes.byteLength <= 100 * 1024 * 1024) return [];
  return ["Geometry source bytes must contain 1 byte to 100 MiB."];
}

export function validateCADGeometrySource(value: unknown): string[] {
  const source = asRecord(value);
  if (!source) return ["Geometry source must be an object."];
  return [
    ...validateIdentityFields(source),
    ...validateDigest(source),
    ...validateSourceBytes(source)
  ];
}

export function unavailableGeometryResult<T>(operation: string): CADGeometryResult<T> {
  return {
    status: "UNSUPPORTED",
    errors: [],
    limitations: [operation + " is not implemented by the current OCCT validation worker."]
  };
}

/**
 * Verify that the exact bytes supplied to a geometry adapter match the declared
 * canonical artifact digest. This function is a byte-integrity check only; it
 * does not parse, validate or approve the geometry.
 */
export async function verifyCADGeometrySourceDigest(value: unknown): Promise<boolean> {
  if (validateCADGeometrySource(value).length > 0 || !globalThis.crypto?.subtle) return false;
  const source = value as CADGeometrySource;
  try {
    const exactBytes = new Uint8Array(source.bytes.byteLength);
    exactBytes.set(source.bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", exactBytes.buffer);
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return hex === source.sha256;
  } catch {
    return false;
  }
}
