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
function isValidGeometryReceipt(input: {
  receipt: unknown; revision: Row; projectId: string; modelIdentityId: string; solidId: string;
}): boolean {
  const receipt = input.receipt;
  if (!isRecord(receipt)) return false;
  if (receipt.artifactSha256 !== input.revision.canonical_artifact_sha256) return false;
  if (receipt.projectId !== input.projectId) return false;
  if (receipt.artifactId !== input.solidId) return false;
  if (receipt.modelIdentityId !== input.modelIdentityId) return false;
  if (typeof receipt.checkedBy !== "string" || !receipt.checkedBy.trim()) return false;
  if (typeof receipt.validatorProviderId !== "string" || !receipt.validatorProviderId.trim()) return false;
  if (typeof receipt.validatorVersion !== "string" || !receipt.validatorVersion.trim()) return false;
  if (typeof receipt.checkedAt !== "string" || Number.isNaN(Date.parse(receipt.checkedAt))) return false;
  if (!isRecord(receipt.validation)) return false;
  return receipt.validation.valid === true;
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
  const measurements = receiptRecord.geometryMeasurements;
  const bounds = isRecord(measurements) ? measurements.boundingBoxMm : undefined;
  if (!isRecord(bounds)) fail({ message: "Accepted geometry receipt has no bounding box measurements.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.x)) fail({ message: "Accepted shaft X extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.y)) fail({ message: "Accepted shaft Y extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.z)) fail({ message: "Accepted shaft Z extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (Math.abs(bounds.x - bounds.y) > 0.02) {
    fail({ message: "Source geometry is not a world-Z cylindrical shaft within 0.02 mm cross-section tolerance.", status: 422, code: "UNSUPPORTED_SHAFT_GEOMETRY" });
  }
  return { diameterMm: (bounds.x + bounds.y) / 2, lengthMm: bounds.z };
}
export async function loadAcceptedShaftSource(
  serviceDb: ServiceDb, revision: Row, projectId: string, modelIdentityId: string
): Promise<AcceptedShaftSource> {
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
