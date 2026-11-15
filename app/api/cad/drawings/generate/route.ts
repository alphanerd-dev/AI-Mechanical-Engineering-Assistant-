import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../../src/auth/supabase-service";
import { persistEngineeringAuditEvent } from "../../../../../src/audit/server";
import { CAD_ARTIFACT_BUCKET, CAD_SIGNED_URL_TTL_SECONDS } from "../../../../../src/cad/persistence";
import { inspectCADDrawingUpload } from "../../../../../src/drawings/ingestion";
import { generateShaftOrthographicSvgDrawing } from "../../../../../src/drawings/shaft-orthographic";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16 * 1024;
type Row = Record<string, unknown>;

class DrawingGenerationError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "DrawingGenerationError";
  }
}
function fail(message: string, status: number, code?: string): never {
  throw new DrawingGenerationError(message, status, code);
}
function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function errorResponse(error: unknown): NextResponse {
  if (error instanceof DrawingGenerationError) {
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, {
      status: error.status, headers: { "cache-control": "no-store" }
    });
  }
  return NextResponse.json({ error: "CAD drawing generation failed without changing geometry validation or approval state." }, {
    status: 500, headers: { "cache-control": "no-store" }
  });
}
async function parseRequest(request: Request): Promise<{ projectId: string; modelIdentityId: string; geometryRevisionId: string; drawingNumber?: string; title?: string }> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) fail("Drawing generation request exceeds 16 KiB.", 413, "REQUEST_TOO_LARGE");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) fail("Drawing generation request exceeds 16 KiB.", 413, "REQUEST_TOO_LARGE");
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("Drawing generation request must be valid UTF-8 JSON.", 400, "INVALID_JSON"); }
  if (!isRecord(body) || !isUuid(body.projectId) || !isUuid(body.modelIdentityId) || !isUuid(body.geometryRevisionId)) {
    fail("Valid projectId, modelIdentityId and geometryRevisionId are required.", 400, "INVALID_IDENTITY");
  }
  if (body.drawingNumber !== undefined && (typeof body.drawingNumber !== "string" || body.drawingNumber.length > 80)) {
    fail("drawingNumber must be a string of at most 80 characters.", 400, "INVALID_DRAWING_NUMBER");
  }
  if (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 120)) {
    fail("title must be a string of at most 120 characters.", 400, "INVALID_TITLE");
  }
  return {
    projectId: body.projectId, modelIdentityId: body.modelIdentityId, geometryRevisionId: body.geometryRevisionId,
    ...(typeof body.drawingNumber === "string" ? { drawingNumber: body.drawingNumber } : {}),
    ...(typeof body.title === "string" ? { title: body.title } : {})
  };
}
async function requireAuthorizedIdentity(projectId: string) {
  let authorization;
  try { authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId); }
  catch { fail("Project authorization is unavailable.", 503, "AUTHORIZATION_UNAVAILABLE"); }
  if (!authorization.allowed) fail(authorization.reason, authorizationFailureStatus(authorization), "PROJECT_ACCESS_DENIED");
  if (!authorization.subject) fail("Authenticated project identity is unavailable.", 503, "IDENTITY_UNAVAILABLE");
  const sessionDb = await createClient();
  const user = await sessionDb.auth.getUser();
  if (user.error || !user.data.user || user.data.user.id !== authorization.subject) {
    fail("Authenticated project identity could not be confirmed.", 401, "SESSION_IDENTITY_MISMATCH");
  }
  return { subject: authorization.subject, sessionDb };
}
async function loadCurrentGeometryRevision(serviceDb: ReturnType<typeof createServiceRoleClient>, input: {
  projectId: string; modelIdentityId: string; geometryRevisionId: string;
}): Promise<Row> {
  const { data, error } = await serviceDb.from("engineering_geometry_revisions").select("*")
    .eq("project_id", input.projectId).eq("model_identity_id", input.modelIdentityId)
    .order("revision_number", { ascending: false }).limit(1);
  if (error || !Array.isArray(data) || !data.length || !isRecord(data[0])) {
    fail("Current accepted geometry revision could not be loaded.", 503, "GEOMETRY_REVISION_UNAVAILABLE");
  }
  const revision = data[0];
  if (revision.id !== input.geometryRevisionId) {
    fail("The requested drawing source is stale. Reload the current geometry revision before generating a drawing.", 409, "STALE_DRAWING_SOURCE");
  }
  return revision;
}
async function loadAcceptedCompletion(serviceDb: ReturnType<typeof createServiceRoleClient>, revision: Row, projectId: string, modelIdentityId: string): Promise<{ completion: Row; solid: Row; diameterMm: number; lengthMm: number }> {
  const { data, error } = await serviceDb.from("engineering_cad_completions").select("*")
    .eq("id", revision.source_completion_id).eq("project_id", projectId)
    .eq("model_identity_id", modelIdentityId).maybeSingle();
  if (error || !isRecord(data)) fail("Accepted CAD completion for the source geometry revision could not be loaded.", 503, "SOURCE_COMPLETION_UNAVAILABLE");
  if (data.status !== "ACCEPTED" || !Array.isArray(data.artifact_records)) {
    fail("Drawing generation requires an accepted CAD completion manifest.", 422, "SOURCE_COMPLETION_NOT_ACCEPTED");
  }
  const solid = data.artifact_records.find((item: unknown) => isRecord(item) && item.id === revision.canonical_artifact_id);
  if (!isRecord(solid) || solid.kind !== "SOLID" || solid.validationStatus !== "PASS" || !isRecord(solid.provenance)) {
    fail("Canonical source artifact does not match the accepted completion manifest.", 422, "SOURCE_ARTIFACT_MISMATCH");
  }
  if (solid.provenance.artifactSha256 !== revision.canonical_artifact_sha256 ||
      solid.uri !== "storage://" + String(revision.storage_bucket) + "/" + String(revision.storage_object_name)) {
    fail("Canonical source artifact digest or storage lineage does not match the immutable geometry revision.", 422, "SOURCE_DIGEST_MISMATCH");
  }
  const receipt = data.validation_receipt;
  const measurements = isRecord(receipt) && isRecord(receipt.geometryMeasurements) ? receipt.geometryMeasurements : undefined;
  const bounds = measurements && isRecord(measurements.boundingBoxMm) ? measurements.boundingBoxMm : undefined;
  if (!bounds || !finitePositive(bounds.x) || !finitePositive(bounds.y) || !finitePositive(bounds.z) ||
      Math.abs((bounds.x as number) - (bounds.y as number)) > 0.02 ||
      !isRecord(receipt) || receipt.artifactSha256 !== revision.canonical_artifact_sha256 ||
      !isRecord(receipt.validation) || receipt.validation.valid !== true) {
    fail("Accepted geometry receipt does not contain source-bound cylinder dimensions suitable for this drawing generator.", 422, "GEOMETRY_MEASUREMENTS_UNAVAILABLE");
  }
  return { completion: data, solid, diameterMm: ((bounds.x as number) + (bounds.y as number)) / 2, lengthMm: bounds.z as number };
}
async function verifyCanonicalSourceBytes(serviceDb: ReturnType<typeof createServiceRoleClient>, revision: Row): Promise<void> {
  const bucket = String(revision.storage_bucket);
  const path = String(revision.storage_object_name);
  if (bucket !== CAD_ARTIFACT_BUCKET || !path.startsWith(String(revision.project_id) + "/") || path.includes("..")) {
    fail("Canonical source storage identity is invalid.", 422, "SOURCE_STORAGE_INVALID");
  }
  const downloaded = await serviceDb.storage.from(bucket).download(path);
  if (downloaded.error || !downloaded.data) fail("Canonical source geometry bytes could not be retrieved.", 503, "SOURCE_STORAGE_UNAVAILABLE");
  const digest = createHash("sha256").update(new Uint8Array(await downloaded.data.arrayBuffer())).digest("hex");
  if (digest !== revision.canonical_artifact_sha256) {
    fail("Canonical source geometry bytes no longer match their immutable SHA-256 receipt.", 422, "SOURCE_DIGEST_MISMATCH");
  }
}
async function persistGeneratedDrawing(input: {
  serviceDb: ReturnType<typeof createServiceRoleClient>;
  sessionDb: Awaited<ReturnType<typeof createClient>>;
  subject: string;
  projectId: string;
  modelIdentityId: string;
  revision: Row;
  drawingNumber: string;
  title: string;
  diameterMm: number;
  lengthMm: number;
}) {
  const drawingId = randomUUID();
  const drawing = generateShaftOrthographicSvgDrawing({
    drawingNumber: input.drawingNumber,
    title: input.title,
    diameterMm: input.diameterMm,
    lengthMm: input.lengthMm,
    sourceGeometryRevisionId: String(input.revision.id),
    sourceArtifactId: String(input.revision.canonical_artifact_id),
    sourceArtifactSha256: String(input.revision.canonical_artifact_sha256),
    sourceRevisionNumber: Number(input.revision.revision_number)
  });
  const inspected = inspectCADDrawingUpload({
    filename: "generated-shaft.svg", declaredMimeType: "image/svg+xml", bytes: drawing.bytes
  });
  const storagePath = input.projectId + "/" + input.modelIdentityId + "/" + drawingId + "/drawing.svg";
  const uploaded = await input.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).upload(storagePath, drawing.bytes, {
    upsert: false, contentType: drawing.mediaType, cacheControl: "3600"
  });
  if (uploaded.error) fail("Generated drawing could not be stored in private project storage.", 503, "DRAWING_STORAGE_FAILED");

  const row = {
    id: drawingId,
    project_id: input.projectId,
    model_identity_id: input.modelIdentityId,
    display_name: input.drawingNumber + ".svg",
    format: "SVG",
    media_type: drawing.mediaType,
    byte_size: drawing.bytes.byteLength,
    sha256: drawing.sha256,
    storage_object_path: storagePath,
    parser_version: inspected.parserVersion,
    units: drawing.units,
    entity_count: drawing.entityCount,
    bounds: drawing.bounds,
    warnings: [...drawing.warnings, ...inspected.warnings],
    created_by: input.subject,
    source_geometry_revision_id: input.revision.id,
    source_artifact_id: input.revision.canonical_artifact_id,
    source_artifact_sha256: input.revision.canonical_artifact_sha256,
    source_revision_number: input.revision.revision_number,
    generator_id: drawing.generatorId,
    generator_version: drawing.generatorVersion,
    generation_parameters: drawing.parameters
  };
  const inserted = await input.serviceDb.from("engineering_cad_drawings").insert(row);
  if (inserted.error) {
    await input.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storagePath]);
    fail("Generated drawing metadata could not be committed; the uploaded object was removed.", 503, "DRAWING_METADATA_FAILED");
  }
  try {
    await persistEngineeringAuditEvent({
      timestamp: new Date().toISOString(),
      actor: { subject: input.subject, actorType: "USER" },
      action: "PROJECT_WRITE",
      outcome: "SUCCESS",
      projectId: input.projectId,
      resourceType: "CAD_DRAWING",
      resourceId: drawingId,
      reason: "A deterministic preliminary shaft drawing was generated from exact accepted geometry revision lineage. No geometry validation, verification or approval state was changed.",
      metadata: {
        format: "SVG",
        sha256: drawing.sha256,
        sourceGeometryRevisionId: input.revision.id,
        sourceArtifactId: input.revision.canonical_artifact_id,
        sourceArtifactSha256: input.revision.canonical_artifact_sha256,
        sourceRevisionNumber: input.revision.revision_number,
        generatorId: drawing.generatorId,
        generatorVersion: drawing.generatorVersion
      }
    });
  } catch {
    const audit = await input.serviceDb.from("engineering_audit_events").select("event_id")
      .eq("resource_type", "CAD_DRAWING").eq("resource_id", drawingId).maybeSingle();
    if (audit.data || audit.error) {
      fail("Generated drawing was committed but audit acknowledgement is ambiguous. Reload drawing history before retrying.", 503, "DRAWING_AUDIT_AMBIGUOUS");
    }
    await input.serviceDb.from("engineering_cad_drawings").delete().eq("id", drawingId).eq("project_id", input.projectId);
    await input.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storagePath]);
    fail("Generated drawing audit persistence failed; the drawing was removed.", 503, "DRAWING_AUDIT_FAILED");
  }
  const signed = await input.sessionDb.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(storagePath, CAD_SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    fail("Drawing was saved, but a short-lived read URL could not be created. Reload project drawing history.", 503, "DRAWING_URL_UNAVAILABLE");
  }
  return {
    id: drawingId,
    projectId: input.projectId,
    modelIdentityId: input.modelIdentityId,
    displayName: row.display_name,
    format: row.format,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    parserVersion: row.parser_version,
    units: row.units,
    entityCount: row.entity_count,
    bounds: row.bounds,
    warnings: row.warnings,
    createdAt: new Date().toISOString(),
    sourceGeometryRevisionId: row.source_geometry_revision_id,
    sourceArtifactId: row.source_artifact_id,
    sourceArtifactSha256: row.source_artifact_sha256,
    sourceRevisionNumber: row.source_revision_number,
    generatorId: row.generator_id,
    generatorVersion: row.generator_version,
    generationParameters: row.generation_parameters,
    isStale: false,
    signedUrl: signed.data.signedUrl,
    signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS
  };
}
export async function POST(request: Request) {
  try {
    const input = await parseRequest(request);
    const { subject, sessionDb } = await requireAuthorizedIdentity(input.projectId);
    const serviceDb = createServiceRoleClient();
    const model = await serviceDb.from("engineering_cad_models").select("id")
      .eq("id", input.modelIdentityId).eq("project_id", input.projectId).maybeSingle();
    if (model.error || !model.data) fail("CAD model identity does not belong to this project.", 404, "MODEL_NOT_FOUND");
    const revision = await loadCurrentGeometryRevision(serviceDb, input);
    await verifyCanonicalSourceBytes(serviceDb, revision);
    const source = await loadAcceptedCompletion(serviceDb, revision, input.projectId, input.modelIdentityId);
    const revisionNumber = Number(revision.revision_number);
    const drawingNumber = input.drawingNumber?.trim() || "SHAFT-" + revisionNumber + "-" + String(revision.id).slice(0, 8).toUpperCase();
    const title = input.title?.trim() || "Shaft — Geometry Revision " + revisionNumber;
    const drawing = await persistGeneratedDrawing({
      serviceDb, sessionDb, subject, projectId: input.projectId, modelIdentityId: input.modelIdentityId,
      revision, drawingNumber, title, diameterMm: source.diameterMm, lengthMm: source.lengthMm
    });
    return NextResponse.json({ drawing }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
