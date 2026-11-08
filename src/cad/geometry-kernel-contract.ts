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

export function validateCADGeometrySource(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Geometry source must be an object."];
  const source = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of ["artifactId", "modelIdentityId", "units", "coordinateFrame"] as const) {
    if (typeof source[key] !== "string" || !(source[key] as string).trim()) errors.push(key + " is required.");
  }
  if (typeof source.modelRevision !== "number" || !Number.isSafeInteger(source.modelRevision) || source.modelRevision < 1) {
    errors.push("modelRevision must be a positive safe integer.");
  }
  if (source.format !== "BREP" && source.format !== "STEP") errors.push("Geometry source format is unsupported.");
  if (typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.sha256)) errors.push("sha256 must be a lowercase SHA-256 digest.");
  if (!(source.bytes instanceof Uint8Array) || source.bytes.byteLength < 1 || source.bytes.byteLength > 100 * 1024 * 1024) {
    errors.push("Geometry source bytes must contain 1 byte to 100 MiB.");
  }
  return errors;
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
  if (validateCADGeometrySource(value).length > 0) return false;
  const source = value as CADGeometrySource;
  if (!globalThis.crypto?.subtle) return false;
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
