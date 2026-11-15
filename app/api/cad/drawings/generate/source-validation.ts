import type { CanonicalSolid, Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { CAD_ARTIFACT_BUCKET } from "../../../../../src/cad/persistence";
import { fail } from "./request";

export function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
function hasTrustedReceiptValidator(receipt: Row): boolean {
  if (typeof receipt.checkedBy !== "string" || !receipt.checkedBy.trim()) return false;
  if (typeof receipt.validatorProviderId !== "string" || !receipt.validatorProviderId.trim()) return false;
  if (typeof receipt.validatorVersion !== "string" || !receipt.validatorVersion.trim()) return false;
  if (typeof receipt.checkedAt !== "string" || Number.isNaN(Date.parse(receipt.checkedAt))) return false;
  return true;
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
