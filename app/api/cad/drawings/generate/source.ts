import {
  loadCompletion,
  resolveCanonicalSolid,
  verifyStoredBrep
} from "../../../../../src/cad/geometry-revision-persistence-source";
import { CAD_ARTIFACT_BUCKET } from "../../../../../src/cad/persistence";
import type { CanonicalSolid, Completion, GeometryRevisionDatabase, Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { fail } from "./request";

type ServiceDb = ReturnType<typeof import("../../../../../lib/supabase/service").createServiceRoleClient>;
export interface AcceptedShaftSource {
  completion: Completion;
  solid: CanonicalSolid;
  diameterMm: number;
  lengthMm: number;
}
function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
export async function loadCurrentGeometryRevision(serviceDb: ServiceDb, input: {
  projectId: string; modelIdentityId: string; geometryRevisionId: string;
}): Promise<Row> {
  const { data, error } = await serviceDb.from("engineering_geometry_revisions").select("*")
    .eq("project_id", input.projectId).eq("model_identity_id", input.modelIdentityId)
    .order("revision_number", { ascending: false }).limit(1);
  if (error) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (!Array.isArray(data)) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (data.length === 0) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (!isRecord(data[0])) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  const revision = data[0];
  if (revision.id !== input.geometryRevisionId) {
    fail({ message: "The requested drawing source is stale. Reload the current geometry revision before generating a drawing.", status: 409, code: "STALE_DRAWING_SOURCE" });
  }
  return revision;
}
function validateRevisionArtifactBinding(revision: Row, solid: CanonicalSolid): void {
  if (solid.id !== revision.canonical_artifact_id) fail({ message: "Canonical solid ID does not match the geometry revision.", status: 422, code: "SOURCE_ARTIFACT_MISMATCH" });
  if (solid.provenance.artifactSha256 !== revision.canonical_artifact_sha256) {
    fail({ message: "Canonical solid digest does not match the immutable geometry revision.", status: 422, code: "SOURCE_DIGEST_MISMATCH" });
  }
  if (revision.storage_bucket !== CAD_ARTIFACT_BUCKET) fail({ message: "Geometry revision storage bucket is invalid.", status: 422, code: "SOURCE_STORAGE_INVALID" });
  if (solid.objectPath !== revision.storage_object_name) fail({ message: "Geometry revision storage path does not match the accepted completion.", status: 422, code: "SOURCE_STORAGE_MISMATCH" });
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
function isValidGeometryReceipt(input: {
  receipt: unknown; revision: Row; projectId: string; modelIdentityId: string; solidId: string;
}): boolean {
  if (!isRecord(input.receipt)) return false;
  if (!hasReceiptArtifactBinding({ ...input, receipt: input.receipt })) return false;
  if (!hasTrustedReceiptValidator(input.receipt)) return false;
  return hasPassedGeometryValidation(input.receipt);
}
function requireShaftSpecification(completion: Completion): Row {
  const specification = completion.specification;
  if (!isRecord(specification)) fail({ message: "Accepted CAD specification is missing.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  if (specification.kind !== "CYLINDER" || specification.name !== "shaft") {
    fail({ message: "Drawing generator currently supports accepted cylindrical shaft specifications only.", status: 422, code: "UNSUPPORTED_SHAFT_SPECIFICATION" });
  }
  if (!finitePositive(specification.diameterMm) || !finitePositive(specification.lengthMm)) {
    fail({ message: "Accepted shaft specification dimensions are invalid.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  }
  return specification;
}
function requireShaftBounds(receipt: Row): Row {
  const measurements = receipt.geometryMeasurements;
  const bounds = isRecord(measurements) ? measurements.boundingBoxMm : undefined;
  if (!isRecord(bounds)) fail({ message: "Accepted geometry receipt has no bounding box measurements.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.x)) fail({ message: "Accepted shaft X extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.y)) fail({ message: "Accepted shaft Y extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.z)) fail({ message: "Accepted shaft Z extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (Math.abs(bounds.x - bounds.y) > 0.02) {
    fail({ message: "Source geometry is not a world-Z cylindrical shaft within 0.02 mm cross-section tolerance.", status: 422, code: "UNSUPPORTED_SHAFT_GEOMETRY" });
  }
  return bounds;
}
function validateSpecificationDimensions(input: { specification: Row; bounds: Row }): void {
  const measuredDiameter = (input.bounds.x as number + input.bounds.y as number) / 2;
  if (Math.abs(measuredDiameter - (input.specification.diameterMm as number)) > 0.02) {
    fail({ message: "Measured shaft diameter does not match the accepted CAD specification.", status: 422, code: "SHAFT_DIMENSION_MISMATCH" });
  }
  if (Math.abs((input.bounds.z as number) - (input.specification.lengthMm as number)) > 0.02) {
    fail({ message: "Measured shaft length does not match the accepted CAD specification.", status: 422, code: "SHAFT_DIMENSION_MISMATCH" });
  }
}
function extractCylinderDimensions(input: {
  completion: Completion; revision: Row; projectId: string; modelIdentityId: string; solidId: string;
}): { diameterMm: number; lengthMm: number } {
  const receipt = input.completion.validation_receipt;
  if (!isValidGeometryReceipt({
    receipt, revision: input.revision, projectId: input.projectId,
    modelIdentityId: input.modelIdentityId, solidId: input.solidId
  })) {
    fail({ message: "Accepted geometry receipt identity or validation status is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  }
  const receiptRecord = receipt as Row;
  const specification = requireShaftSpecification(input.completion);
  const bounds = requireShaftBounds(receiptRecord);
  validateSpecificationDimensions({ specification, bounds });
  return { diameterMm: ((bounds.x as number) + (bounds.y as number)) / 2, lengthMm: bounds.z as number };
}
export async function loadAcceptedShaftSource(input: {
  serviceDb: ServiceDb; revision: Row; projectId: string; modelIdentityId: string;
}): Promise<AcceptedShaftSource> {
  const { serviceDb, revision, projectId, modelIdentityId } = input;
  const completionResult = await loadCompletion(
    serviceDb as unknown as GeometryRevisionDatabase, projectId, String(revision.source_completion_id)
  );
  if (!completionResult.ok) fail({ message: completionResult.message, status: completionResult.status, code: "SOURCE_COMPLETION_UNAVAILABLE" });
  const completion = completionResult.value;
  if (completion.model_identity_id !== modelIdentityId) fail({ message: "Source completion belongs to a different CAD model.", status: 422, code: "SOURCE_COMPLETION_MODEL_MISMATCH" });
  const solidResult = resolveCanonicalSolid(completion, projectId);
  if (!solidResult.ok) fail({ message: solidResult.message, status: solidResult.status, code: "SOURCE_ARTIFACT_MISMATCH" });
  const solid = solidResult.value;
  validateRevisionArtifactBinding(revision, solid);
  const storedResult = await verifyStoredBrep(serviceDb as unknown as GeometryRevisionDatabase, solid);
  if (!storedResult.ok) fail({ message: storedResult.message, status: storedResult.status, code: "SOURCE_DIGEST_MISMATCH" });
  const dimensions = extractCylinderDimensions({
    completion, revision, projectId, modelIdentityId, solidId: solid.id
  });
  return { completion, solid, ...dimensions };
}
