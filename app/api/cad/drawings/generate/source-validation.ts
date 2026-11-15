import type { CanonicalSolid, Completion, Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { CAD_ARTIFACT_BUCKET } from "../../../../../src/cad/persistence";
import { fail } from "./request";

export function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
export function requireShaftSpecification(completion: Completion): Row {
  const specification = completion.specification;
  if (!isRecord(specification)) fail({ message: "Accepted CAD specification is missing.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  if (specification.kind !== "CYLINDER") {
    fail({ message: "Drawing generator currently supports cylindrical shaft geometry only.", status: 422, code: "UNSUPPORTED_SHAFT_SPECIFICATION" });
  }
  if (specification.name !== "shaft") {
    fail({ message: "Drawing generator currently supports accepted shaft specifications only.", status: 422, code: "UNSUPPORTED_SHAFT_SPECIFICATION" });
  }
  if (!finitePositive(specification.diameterMm)) {
    fail({ message: "Accepted shaft diameter is invalid.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  }
  if (!finitePositive(specification.lengthMm)) {
    fail({ message: "Accepted shaft length is invalid.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  }
  return specification;
}
export function requireShaftBounds(receipt: Row): Row {
  const measurements = receipt.geometryMeasurements;
  const bounds = isRecord(measurements) ? measurements.boundingBoxMm : undefined;
  if (!isRecord(bounds)) fail({ message: "Accepted geometry receipt has no bounding box measurements.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  for (const axis of ["x", "y", "z"] as const) {
    if (!finitePositive(bounds[axis])) {
      fail({ message: "Accepted shaft " + axis.toUpperCase() + " extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
    }
  }
  return bounds;
}
export function validateRevisionArtifactBinding(revision: Row, solid: CanonicalSolid): void {
  if (solid.id !== revision.canonical_artifact_id) {
    fail({ message: "Canonical solid ID does not match the geometry revision.", status: 422, code: "SOURCE_ARTIFACT_MISMATCH" });
  }
  if (solid.provenance.artifactSha256 !== revision.canonical_artifact_sha256) {
    fail({ message: "Canonical solid digest does not match the immutable geometry revision.", status: 422, code: "SOURCE_DIGEST_MISMATCH" });
  }
  if (revision.storage_bucket !== CAD_ARTIFACT_BUCKET) {
    fail({ message: "Geometry revision storage bucket is invalid.", status: 422, code: "SOURCE_STORAGE_INVALID" });
  }
  if (solid.objectPath !== revision.storage_object_name) {
    fail({ message: "Geometry revision storage path does not match the accepted completion.", status: 422, code: "SOURCE_STORAGE_MISMATCH" });
  }
}
function hasReceiptArtifactBinding(input: {
  receipt: Row; revision: Row; projectId: string; modelIdentityId: string; solidId: string;
}): boolean {
  if (input.receipt.artifactSha256 !== input.revision.canonical_artifact_sha256) return false;
  if (input.receipt.projectId !== input.projectId) return false;
  if (input.receipt.artifactId !== input.solidId) return false;
  return input.receipt.modelIdentityId === input.modelIdentityId;
}
function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isValidTimestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value));
}
function hasTrustedReceiptValidator(receipt: Row): boolean {
  const providerIdValid = isNonBlank(receipt.validatorProviderId);
  const versionValid = isNonBlank(receipt.validatorVersion);
  const checkedByValid = isNonBlank(receipt.checkedBy);
  const timestampValid = isValidTimestamp(receipt.checkedAt);
  return checkedByValid && providerIdValid && versionValid && timestampValid;
}
function hasPassedGeometryValidation(receipt: Row): boolean {
  if (!isRecord(receipt.validation)) return false;
  return receipt.validation.valid === true;
}
export function isValidGeometryReceipt(input: {
  receipt: unknown; revision: Row; projectId: string; modelIdentityId: string; solidId: string;
}): boolean {
  if (!isRecord(input.receipt)) return false;
  if (!hasReceiptArtifactBinding({ ...input, receipt: input.receipt })) return false;
  if (!hasTrustedReceiptValidator(input.receipt)) return false;
  return hasPassedGeometryValidation(input.receipt);
}
