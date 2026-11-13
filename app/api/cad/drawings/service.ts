import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { persistEngineeringAuditEvent } from "../../../../src/audit/server";
import { CAD_ARTIFACT_BUCKET, CAD_SIGNED_URL_TTL_SECONDS } from "../../../../src/cad/persistence";
import { inspectCADDrawingUpload, type CADDrawingInspection } from "../../../../src/drawings/ingestion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 128 * 1024;
type Row = Record<string, unknown>;
type Database = Awaited<ReturnType<typeof createClient>>;
type ServiceDatabase = ReturnType<typeof createServiceRoleClient>;

class DrawingAPIError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "DrawingAPIError";
  }
}
class DrawingAuditAmbiguousError extends DrawingAPIError {}
class DrawingCommitAmbiguousError extends DrawingAPIError {}

interface UploadRequest {
  projectId: string;
  modelIdentityId: string | null;
  file: File;
}
interface UploadContext {
  subject: string;
  db: Database;
  serviceDb: ServiceDatabase;
}

function fail(message: string, status: number): never {
  throw new DrawingAPIError(message, status);
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof DrawingAPIError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ error: "Project drawing service failed unexpectedly." }, {
    status: 500, headers: { "cache-control": "no-store" }
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function safeDisplayName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "drawing";
  return base.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 180) || "drawing";
}

async function readDrawingUploadForm(request: Request): Promise<FormData> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    fail("Drawing upload exceeds the 4 MiB file limit.", 413);
  }
  try {
    return await request.formData();
  } catch {
    fail("Drawing upload must use multipart/form-data.", 400);
  }
}

function parseUploadProjectId(form: FormData): string {
  const value = form.get("projectId");
  if (!isUuid(value)) fail("A registered project UUID is required.", 400);
  return value;
}

function parseUploadModelIdentityId(form: FormData): string | null {
  const value = form.get("modelIdentityId");
  if (value === null) return null;
  if (!isUuid(value)) fail("The optional CAD model identity UUID is invalid.", 400);
  return value;
}

function parseUploadFile(form: FormData): File {
  const value = form.get("file");
  if (!(value instanceof File)) fail("A drawing file is required.", 400);
  return value;
}

function parseDrawingUploadFields(form: FormData): UploadRequest {
  return {
    projectId: parseUploadProjectId(form),
    modelIdentityId: parseUploadModelIdentityId(form),
    file: parseUploadFile(form)
  };
}

function validateDrawingUploadFile(file: File): void {
  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    fail("Drawing must contain 1 byte to 4 MiB.", 413);
  }
}

async function parseUploadRequest(request: Request): Promise<UploadRequest> {
  const parsed = parseDrawingUploadFields(await readDrawingUploadForm(request));
  validateDrawingUploadFile(parsed.file);
  return parsed;
}
async function authorizeUpload(projectId: string): Promise<UploadContext> {
  try {
    const authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
    if (!authorization.allowed) fail(authorization.reason, authorizationFailureStatus(authorization));
    return { subject: authorization.subject, db: await createClient(), serviceDb: createServiceRoleClient() };
  } catch (error) {
    if (error instanceof DrawingAPIError) throw error;
    fail("Project authorization or trusted drawing storage is unavailable.", 503);
  }
}

async function verifyModelAssociation(db: Database, projectId: string, modelIdentityId: string | null) {
  if (!modelIdentityId) return;
  const { data, error } = await db.from("engineering_cad_models")
    .select("id").eq("id", modelIdentityId).eq("project_id", projectId).maybeSingle();
  if (error) fail("CAD model identity could not be verified.", 503);
  if (!data) fail("CAD model identity does not belong to this project.", 404);
}

async function inspectUpload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let inspection: CADDrawingInspection;
  try {
    inspection = inspectCADDrawingUpload({ filename: file.name, declaredMimeType: file.type, bytes });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Drawing content failed inspection.", 422);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, inspection, sha256 };
}

async function writeDrawingAudit(
  serviceDb: ServiceDatabase,
  subject: string,
  projectId: string,
  drawingId: string,
  inspection: CADDrawingInspection,
  byteSize: number,
  sha256: string,
  modelIdentityId: string | null
) {
  try {
    await persistEngineeringAuditEvent({
      timestamp: new Date().toISOString(),
      actor: { subject, actorType: "USER" },
      action: "PROJECT_WRITE",
      outcome: "SUCCESS",
      projectId,
      resourceType: "CAD_DRAWING",
      resourceId: drawingId,
      reason: "A bounded source drawing was inspected and stored in private project storage; no geometry validation or approval state was changed.",
      metadata: {
        format: inspection.format, mediaType: inspection.mediaType, byteSize, sha256,
        parserVersion: inspection.parserVersion, modelIdentityId,
        entityCount: inspection.entityCount ?? null, units: inspection.units ?? null
      }
    });
  } catch {
    const { data, error } = await serviceDb.from("engineering_audit_events").select("event_id")
      .eq("resource_type", "CAD_DRAWING").eq("resource_id", drawingId)
      .eq("action", "PROJECT_WRITE").maybeSingle();
    if (data || error) throw new DrawingAuditAmbiguousError("Drawing upload was committed but its audit acknowledgement is ambiguous. Reload drawing history before retrying.", 503);
    fail("Drawing audit persistence failed.", 503);
  }
}

async function insertDrawingRecord(
  serviceDb: ServiceDatabase,
  row: Row,
  drawingId: string,
  projectId: string,
  storagePath: string
) {
  const { error: insertError } = await serviceDb.from("engineering_cad_drawings").insert(row);
  if (!insertError) return;
  const { data, error } = await serviceDb.from("engineering_cad_drawings")
    .select("id").eq("id", drawingId).eq("project_id", projectId).maybeSingle();
  if (data) return;
  if (error) throw new DrawingCommitAmbiguousError("Drawing upload result is ambiguous. Reload drawing history before retrying.", 503);
  await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storagePath]);
  fail("Drawing metadata could not be committed; the uploaded object was cleaned up.", 503);
}

async function createDrawingSignedUrl(db: Database, storagePath: string): Promise<string> {
  const { data, error } = await db.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(storagePath, CAD_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) fail("Drawing was persisted but its short-lived read URL could not be created. Reload drawing history.", 503);
  return data.signedUrl;
}

async function persistDrawing(
  context: UploadContext,
  upload: UploadRequest,
  inspected: Awaited<ReturnType<typeof inspectUpload>>
): Promise<NextResponse> {
  const drawingId = randomUUID();
  const { bytes, inspection, sha256 } = inspected;
  const extension = inspection.format.toLowerCase();
  const storagePath = upload.projectId + "/" + (upload.modelIdentityId ?? "project") + "/" + drawingId + "/drawing." + extension;
  const { error: uploadError } = await context.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).upload(storagePath, bytes, {
    upsert: false, contentType: inspection.mediaType, cacheControl: "3600"
  });
  if (uploadError) fail("Private project drawing upload failed.", 503);

  const row = {
    id: drawingId, project_id: upload.projectId, model_identity_id: upload.modelIdentityId,
    display_name: safeDisplayName(upload.file.name), format: inspection.format, media_type: inspection.mediaType,
    byte_size: bytes.byteLength, sha256, storage_object_path: storagePath,
    parser_version: inspection.parserVersion, units: inspection.units ?? null,
    entity_count: inspection.entityCount ?? null, bounds: inspection.bounds ?? null,
    warnings: inspection.warnings, created_by: context.subject
  };
  try {
    await insertDrawingRecord(context.serviceDb, row, drawingId, upload.projectId, storagePath);
    await writeDrawingAudit(context.serviceDb, context.subject, upload.projectId, drawingId,
      inspection, bytes.byteLength, sha256, upload.modelIdentityId);
  } catch (error) {
    if (error instanceof DrawingAuditAmbiguousError || error instanceof DrawingCommitAmbiguousError) throw error;
    await context.serviceDb.from("engineering_cad_drawings").delete().eq("id", drawingId).eq("project_id", upload.projectId);
    await context.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storagePath]);
    throw error;
  }
  const signedUrl = await createDrawingSignedUrl(context.db, storagePath);
  return NextResponse.json({
    drawing: {
      id: drawingId, projectId: upload.projectId, modelIdentityId: upload.modelIdentityId,
      displayName: row.display_name, format: inspection.format, mediaType: inspection.mediaType,
      byteSize: bytes.byteLength, sha256, parserVersion: inspection.parserVersion,
      units: inspection.units ?? null, entityCount: inspection.entityCount ?? null,
      bounds: inspection.bounds ?? null, warnings: inspection.warnings, createdAt: new Date().toISOString()
    },
    signedUrl, signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS
  }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function uploadProjectDrawing(request: Request): Promise<NextResponse> {
  try {
    const upload = await parseUploadRequest(request);
    const context = await authorizeUpload(upload.projectId);
    await verifyModelAssociation(context.db, upload.projectId, upload.modelIdentityId);
    const inspected = await inspectUpload(upload.file);
    return await persistDrawing(context, upload, inspected);
  } catch (error) {
    return errorResponse(error);
  }
}

function parseDrawingListProjectId(url: URL): string {
  const value = url.searchParams.get("projectId")?.trim();
  if (!isUuid(value)) fail("A registered project UUID is required.", 400);
  return value;
}

function parseDrawingListModelId(url: URL): string | null {
  const value = url.searchParams.get("modelIdentityId")?.trim() ?? null;
  if (value && !isUuid(value)) fail("The optional model identity UUID is invalid.", 400);
  return value;
}

function parseDrawingListQuery(request: Request): { projectId: string; modelIdentityId: string | null } {
  const url = new URL(request.url);
  return {
    projectId: parseDrawingListProjectId(url),
    modelIdentityId: parseDrawingListModelId(url)
  };
}

async function fetchDrawingRows(db: Database, projectId: string, modelIdentityId: string | null) {
  let query = db.from("engineering_cad_drawings").select("*")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
  if (modelIdentityId) query = query.eq("model_identity_id", modelIdentityId);
  const { data, error } = await query;
  if (error) fail("Project drawing history is unavailable.", 503);
  return data ?? [];
}

async function serializeDrawingRow(db: Database, row: Row) {
  const { data, error } = await db.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(String(row.storage_object_path), CAD_SIGNED_URL_TTL_SECONDS);
  return {
    id: row.id, projectId: row.project_id, modelIdentityId: row.model_identity_id,
    displayName: row.display_name, format: row.format, mediaType: row.media_type,
    byteSize: row.byte_size, sha256: row.sha256, parserVersion: row.parser_version,
    units: row.units, entityCount: row.entity_count, bounds: row.bounds, warnings: row.warnings,
    createdAt: row.created_at, signedUrl: !error && data?.signedUrl ? data.signedUrl : null
  };
}

export async function listProjectDrawings(request: Request): Promise<NextResponse> {
  try {
    const { projectId, modelIdentityId } = parseDrawingListQuery(request);
    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) fail(authorization.reason, authorizationFailureStatus(authorization));
    const db = await createClient();
    const rows = await fetchDrawingRows(db, projectId, modelIdentityId);
    const drawings = await Promise.all(rows.map((row: Row) => serializeDrawingRow(db, row)));
    return NextResponse.json({ projectId, drawings, signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS }, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
