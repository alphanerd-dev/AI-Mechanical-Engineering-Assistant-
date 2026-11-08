export type CADDisplayFormat = "STL" | "GLB" | "GLTF";
export type CADDisplayDerivativeState = "CURRENT" | "STALE" | "UNVERIFIABLE";

export interface CADDisplayDerivative {
  schemaVersion: 1;
  artifactId: string;
  format: CADDisplayFormat;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  modelIdentityId: string;
  modelRevision: number;
  converter: {
    providerId: string;
    version: string;
    operation: "TESSELLATE" | "FORMAT_CONVERSION";
  };
  tessellation: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
    relative: boolean;
  };
  units: string;
  coordinateFrame: string;
  artifactSha256: string;
  generatedAt: string;
}

export interface CADDisplayDerivativeValidation {
  valid: boolean;
  errors: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const NON_EMPTY = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * A display derivative is a projection of exact, immutable canonical bytes.
 * This contract deliberately contains no validation, verification or approval state.
 */
export function validateCADDisplayDerivative(value: unknown): CADDisplayDerivativeValidation {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Display derivative must be an object."] };
  }
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== 1) errors.push("Unsupported display derivative schema version.");
  for (const key of ["artifactId", "sourceArtifactId", "modelIdentityId", "units", "coordinateFrame"] as const) {
    if (!NON_EMPTY(item[key])) errors.push(key + " is required.");
  }
  if (item.format !== "STL" && item.format !== "GLB" && item.format !== "GLTF") {
    errors.push("Display derivative format is unsupported.");
  }
  if (typeof item.modelRevision !== "number" || !Number.isSafeInteger(item.modelRevision) || item.modelRevision < 1) {
    errors.push("modelRevision must be a positive safe integer.");
  }
  if (typeof item.sourceArtifactSha256 !== "string" || !SHA256.test(item.sourceArtifactSha256)) {
    errors.push("sourceArtifactSha256 must be a lowercase SHA-256 digest.");
  }
  if (typeof item.artifactSha256 !== "string" || !SHA256.test(item.artifactSha256)) {
    errors.push("artifactSha256 must be a lowercase SHA-256 digest.");
  }
  if (!NON_EMPTY(item.generatedAt) || Number.isNaN(Date.parse(item.generatedAt))) {
    errors.push("generatedAt must be a valid ISO-compatible date string.");
  }
  if (!item.converter || typeof item.converter !== "object" || Array.isArray(item.converter)) {
    errors.push("converter metadata is required.");
  } else {
    const converter = item.converter as Record<string, unknown>;
    if (!NON_EMPTY(converter.providerId) || !NON_EMPTY(converter.version)) errors.push("Converter provider and version are required.");
    if (converter.operation !== "TESSELLATE" && converter.operation !== "FORMAT_CONVERSION") {
      errors.push("Converter operation is unsupported.");
    }
  }
  if (!item.tessellation || typeof item.tessellation !== "object" || Array.isArray(item.tessellation)) {
    errors.push("Tessellation settings are required.");
  } else {
    const tessellation = item.tessellation as Record<string, unknown>;
    if (typeof tessellation.linearDeflectionMm !== "number" ||
        !Number.isFinite(tessellation.linearDeflectionMm) || tessellation.linearDeflectionMm <= 0) {
      errors.push("linearDeflectionMm must be finite and positive.");
    }
    if (typeof tessellation.angularDeflectionRad !== "number" ||
        !Number.isFinite(tessellation.angularDeflectionRad) ||
        tessellation.angularDeflectionRad <= 0 || tessellation.angularDeflectionRad > Math.PI) {
      errors.push("angularDeflectionRad must be finite, positive and no greater than pi.");
    }
    if (typeof tessellation.relative !== "boolean") errors.push("tessellation.relative must be boolean.");
  }
  return { valid: errors.length === 0, errors };
}

export function classifyCADDisplayDerivative(
  derivative: CADDisplayDerivative,
  currentSource: { id: string; provenance?: { artifactSha256?: string } } | null,
  currentModel: { id: string; revision: number } | null
): CADDisplayDerivativeState {
  if (!currentSource?.provenance?.artifactSha256 || !currentModel ||
      !Number.isSafeInteger(currentModel.revision) || currentModel.revision < 1) {
    return "UNVERIFIABLE";
  }
  const current = currentSource.id === derivative.sourceArtifactId &&
    currentSource.provenance.artifactSha256 === derivative.sourceArtifactSha256 &&
    currentModel.id === derivative.modelIdentityId &&
    currentModel.revision === derivative.modelRevision;
  return current ? "CURRENT" : "STALE";
}
