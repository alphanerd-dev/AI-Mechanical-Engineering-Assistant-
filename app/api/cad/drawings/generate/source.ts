import { createHash } from "node:crypto";
import { CAD_ARTIFACT_BUCKET } from "../../../../../src/cad/persistence";
import { fail } from "./request";

type Row = Record<string, unknown>;
type ServiceDb = ReturnType<typeof import("../../../../../lib/supabase/service").createServiceRoleClient>;
export interface AcceptedShaftSource {
  completion: Row;
  solid: Row;
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
  if (error) fail("Current accepted geometry revision could not be loaded.", 503, "GEOMETRY_REVISION_UNAVAILABLE");
  if (!Array.isArray(data)) fail("Current accepted geometry revision could not be loaded.", 503, "GEOMETRY_REVISION_UNAVAILABLE");
  if (data.length === 0) fail("Current accepted geometry revision could not be loaded.", 503, "GEOMETRY_REVISION_UNAVAILABLE");
  if (!isRecord(data[0])) fail("Current accepted geometry revision could not be loaded.", 503, "GEOMETRY_REVISION_UNAVAILABLE");
  const revision = data[0];
  if (revision.id !== input.geometryRevisionId) {
    fail("The requested drawing source is stale. Reload the current geometry revision before generating a drawing.", 409, "STALE_DRAWING_SOURCE");
  }
  return revision;
}
function findCanonicalSolid(completion: Row, revision: Row): Row {
  if (!Array.isArray(completion.artifact_records)) fail("Accepted completion manifest has no artifact records.", 422, "SOURCE_ARTIFACT_MISSING");
  const artifact = completion.artifact_records.find((item: unknown) => isRecord(item) && item.id === revision.canonical_artifact_id);
  if (!isRecord(artifact)) fail("Canonical source artifact is absent from the accepted completion manifest.", 422, "SOURCE_ARTIFACT_MISMATCH");
  if (artifact.kind !== "SOLID") fail("Canonical source artifact is not a solid.", 422, "SOURCE_ARTIFACT_MISMATCH");
  if (artifact.validationStatus !== "PASS") fail("Canonical source artifact did not pass geometry validation.", 422, "SOURCE_ARTIFACT_MISMATCH");
  if (!isRecord(artifact.provenance)) fail("Canonical source artifact provenance is missing.", 422, "SOURCE_ARTIFACT_MISMATCH");
  return artifact;
}
function validateCanonicalSolidLineage(solid: Row, revision: Row): void {
  if (!isRecord(solid.provenance)) fail("Canonical source artifact provenance is missing.", 422, "SOURCE_DIGEST_MISMATCH");
  if (solid.provenance.artifactSha256 !== revision.canonical_artifact_sha256) {
    fail("Canonical source artifact digest does not match the immutable geometry revision.", 422, "SOURCE_DIGEST_MISMATCH");
  }
  const expectedUri = "storage://" + String(revision.storage_bucket) + "/" + String(revision.storage_object_name);
  if (solid.uri !== expectedUri) fail("Canonical source storage lineage does not match the immutable geometry revision.", 422, "SOURCE_STORAGE_MISMATCH");
}
function isValidCylinderBounds(bounds: unknown): bounds is Row {
  if (!isRecord(bounds)) return false;
  if (!finitePositive(bounds.x) || !finitePositive(bounds.y) || !finitePositive(bounds.z)) return false;
  return Math.abs((bounds.x as number) - (bounds.y as number)) <= 0.02;
}
function isValidGeometryReceipt(receipt: unknown, revision: Row, projectId: string, modelIdentityId: string, solid: Row): receipt is Row {
  if (!isRecord(receipt)) return false;
  if (receipt.artifactSha256 !== revision.canonical_artifact_sha256) return false;
  if (receipt.projectId !== projectId || receipt.artifactId !== solid.id || receipt.modelIdentityId !== modelIdentityId) return false;
  if (!isRecord(receipt.validation) || receipt.validation.valid !== true) return false;
  return receipt.validation.checkedBy === receipt.checkedBy;
}
function extractAcceptedCylinderDimensions(completion: Row, revision: Row, projectId: string, modelIdentityId: string, solid: Row): { diameterMm: number; lengthMm: number } {
  const receipt = completion.validation_receipt;
  const measurements = isRecord(receipt) && isRecord(receipt.geometryMeasurements) ? receipt.geometryMeasurements : undefined;
  const bounds = measurements?.boundingBoxMm;
  if (!isValidGeometryReceipt(receipt, revision, projectId, modelIdentityId, solid)) {
    fail("Accepted geometry receipt identity or validation status is invalid.", 422, "GEOMETRY_MEASUREMENTS_UNAVAILABLE");
  }
  if (!isValidCylinderBounds(bounds)) {
    fail("Accepted geometry receipt does not contain source-bound cylinder dimensions suitable for this drawing generator.", 422, "GEOMETRY_MEASUREMENTS_UNAVAILABLE");
  }
  return {
    diameterMm: ((bounds.x as number) + (bounds.y as number)) / 2,
    lengthMm: bounds.z as number
  };
}
export async function loadAcceptedShaftSource(
  serviceDb: ServiceDb, revision: Row, projectId: string, modelIdentityId: string
): Promise<AcceptedShaftSource> {
  const { data, error } = await serviceDb.from("engineering_cad_completions").select("*")
    .eq("id", revision.source_completion_id).eq("project_id", projectId)
    .eq("model_identity_id", modelIdentityId).maybeSingle();
  if (error) fail("Accepted CAD completion for the source geometry revision could not be loaded.", 503, "SOURCE_COMPLETION_UNAVAILABLE");
  if (!isRecord(data)) fail("Accepted CAD completion for the source geometry revision could not be loaded.", 503, "SOURCE_COMPLETION_UNAVAILABLE");
  if (data.status !== "ACCEPTED") fail("Drawing generation requires an accepted CAD completion manifest.", 422, "SOURCE_COMPLETION_NOT_ACCEPTED");
  const solid = findCanonicalSolid(data, revision);
  validateCanonicalSolidLineage(solid, revision);
  const dimensions = extractAcceptedCylinderDimensions(data, revision, projectId, modelIdentityId, solid);
  return { completion: data, solid, ...dimensions };
}
function validateSourceStorageIdentity(revision: Row): { bucket: string; path: string } {
  const bucket = String(revision.storage_bucket);
  const path = String(revision.storage_object_name);
  const validPath = path.startsWith(String(revision.project_id) + "/") && !path.includes("..");
  if (bucket !== CAD_ARTIFACT_BUCKET) fail("Canonical source storage bucket is invalid.", 422, "SOURCE_STORAGE_INVALID");
  if (!validPath) fail("Canonical source storage path is invalid.", 422, "SOURCE_STORAGE_INVALID");
  return { bucket, path };
}
export async function verifyCanonicalSourceBytes(serviceDb: ServiceDb, revision: Row): Promise<void> {
  const { bucket, path } = validateSourceStorageIdentity(revision);
  const downloaded = await serviceDb.storage.from(bucket).download(path);
  if (downloaded.error) fail("Canonical source geometry bytes could not be retrieved.", 503, "SOURCE_STORAGE_UNAVAILABLE");
  if (!downloaded.data) fail("Canonical source geometry bytes could not be retrieved.", 503, "SOURCE_STORAGE_UNAVAILABLE");
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== revision.canonical_artifact_sha256) {
    fail("Canonical source geometry bytes no longer match their immutable SHA-256 receipt.", 422, "SOURCE_DIGEST_MISMATCH");
  }
}
