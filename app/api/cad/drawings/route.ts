import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { persistEngineeringAuditEvent } from "../../../../src/audit/server";
import { CAD_ARTIFACT_BUCKET, CAD_SIGNED_URL_TTL_SECONDS } from "../../../../src/cad/persistence";
import { inspectCADDrawingUpload } from "../../../../src/drawings/ingestion";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024 + 128 * 1024;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function httpError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}
function safeDisplayName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "drawing";
  return base.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 180) || "drawing";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const modelIdentityId = url.searchParams.get("modelIdentityId")?.trim();
  if (!isUuid(projectId) || (modelIdentityId && !isUuid(modelIdentityId))) {
    return httpError("A registered project UUID and optional model identity UUID are required.", 400);
  }
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) return httpError(authorization.reason, authorizationFailureStatus(authorization));
    const db = await createClient();
    let query = db.from("engineering_cad_drawings").select("*")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    if (modelIdentityId) query = query.eq("model_identity_id", modelIdentityId);
    const { data: rows, error } = await query;
    if (error) return httpError("Project drawing history is unavailable.", 503);
    const drawings = await Promise.all((rows ?? []).map(async (row) => {
      const { data, error: signError } = await db.storage.from(CAD_ARTIFACT_BUCKET)
        .createSignedUrl(String(row.storage_object_path), CAD_SIGNED_URL_TTL_SECONDS);
      return {
        id: row.id,
        projectId: row.project_id,
        modelIdentityId: row.model_identity_id,
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
        createdAt: row.created_at,
        signedUrl: !signError && data?.signedUrl ? data.signedUrl : null
      };
    }));
    return NextResponse.json({ projectId, drawings, signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS }, {
      headers: { "cache-control": "no-store" }
    });
  } catch {
    return httpError("Project drawing service is unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return httpError("Drawing upload exceeds the 4 MiB file limit.", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return httpError("Drawing upload must use multipart/form-data.", 400);
  }
  const projectId = form.get("projectId");
  const modelIdentityId = form.get("modelIdentityId");
  const file = form.get("file");
  if (!isUuid(projectId) || (modelIdentityId !== null && !isUuid(modelIdentityId)) ||
      !(file instanceof File)) {
    return httpError("A registered project, optional model identity and drawing file are required.", 400);
  }
  if (file.size < 1 || file.size > 4 * 1024 * 1024) return httpError("Drawing must contain 1 byte to 4 MiB.", 413);

  let authorization;
  let db: Awaited<ReturnType<typeof createClient>>;
  let serviceDb: ReturnType<typeof createServiceRoleClient>;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
    if (!authorization.allowed) return httpError(authorization.reason, authorizationFailureStatus(authorization));
    db = await createClient();
    serviceDb = createServiceRoleClient();
  } catch {
    return httpError("Project authorization or trusted drawing storage is unavailable.", 503);
  }

  if (modelIdentityId) {
    const { data: model, error } = await db.from("engineering_cad_models")
      .select("id").eq("id", modelIdentityId).eq("project_id", projectId).maybeSingle();
    if (error) return httpError("CAD model identity could not be verified.", 503);
    if (!model) return httpError("CAD model identity does not belong to this project.", 404);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let inspection;
  try {
    inspection = inspectCADDrawingUpload({
      filename: file.name,
      declaredMimeType: file.type,
      bytes
    });
  } catch (error) {
    return httpError(error instanceof Error ? error.message : "Drawing content failed inspection.", 422);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const drawingId = randomUUID();
  const extension = inspection.format.toLowerCase();
  const storageObjectPath = projectId + "/" + (modelIdentityId ?? "project") + "/" + drawingId + "/drawing." + extension;
  const { error: uploadError } = await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).upload(storageObjectPath, bytes, {
    upsert: false, contentType: inspection.mediaType, cacheControl: "3600"
  });
  if (uploadError) return httpError("Private project drawing upload failed.", 503);

  const row = {
    id: drawingId,
    project_id: projectId,
    model_identity_id: modelIdentityId ?? null,
    display_name: safeDisplayName(file.name),
    format: inspection.format,
    media_type: inspection.mediaType,
    byte_size: bytes.byteLength,
    sha256,
    storage_object_path: storageObjectPath,
    parser_version: inspection.parserVersion,
    units: inspection.units ?? null,
    entity_count: inspection.entityCount ?? null,
    bounds: inspection.bounds ?? null,
    warnings: inspection.warnings,
    created_by: authorization.subject
  };
  const { error: insertError } = await serviceDb.from("engineering_cad_drawings").insert(row);
  if (insertError) {
    const { data: existing, error: reconcileError } = await serviceDb.from("engineering_cad_drawings")
      .select("id").eq("id", drawingId).eq("project_id", projectId).maybeSingle();
    if (!existing && !reconcileError) {
      await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storageObjectPath]);
      return httpError("Drawing metadata could not be committed; the uploaded object was cleaned up.", 503);
    }
    if (reconcileError) return httpError("Drawing upload result is ambiguous. Reload drawing history before retrying.", 503);
  }

  try {
    await persistEngineeringAuditEvent({
      timestamp: new Date().toISOString(),
      actor: { subject: authorization.subject, actorType: "USER" },
      action: "PROJECT_WRITE",
      outcome: "SUCCESS",
      projectId,
      resourceType: "CAD_DRAWING",
      resourceId: drawingId,
      reason: "A bounded source drawing was inspected and stored in private project storage; no geometry validation or approval state was changed.",
      metadata: {
        format: inspection.format, mediaType: inspection.mediaType,
        byteSize: bytes.byteLength, sha256, parserVersion: inspection.parserVersion,
        modelIdentityId: modelIdentityId ?? null,
        entityCount: inspection.entityCount ?? null, units: inspection.units ?? null
      }
    });
  } catch {
    const { data: auditRecord, error: auditLookupError } = await serviceDb.from("engineering_audit_events")
      .select("event_id").eq("resource_type", "CAD_DRAWING").eq("resource_id", drawingId)
      .eq("action", "PROJECT_WRITE").maybeSingle();
    if (auditRecord || auditLookupError) {
      return httpError("Drawing upload was committed but its audit acknowledgement is ambiguous. Reload drawing history before retrying.", 503);
    }
    await serviceDb.from("engineering_cad_drawings").delete().eq("id", drawingId).eq("project_id", projectId);
    await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storageObjectPath]);
    return httpError("Drawing audit persistence failed; the uncommitted drawing was rolled back.", 503);
  }

  const { data: signed, error: signError } = await db.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(storageObjectPath, CAD_SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    return httpError("Drawing was persisted but its short-lived read URL could not be created. Reload drawing history.", 503);
  }
  return NextResponse.json({
    drawing: {
      id: drawingId, projectId, modelIdentityId: modelIdentityId ?? null,
      displayName: row.display_name, format: inspection.format, mediaType: inspection.mediaType,
      byteSize: bytes.byteLength, sha256, parserVersion: inspection.parserVersion,
      units: inspection.units ?? null, entityCount: inspection.entityCount ?? null,
      bounds: inspection.bounds ?? null, warnings: inspection.warnings,
      createdAt: new Date().toISOString()
    },
    signedUrl: signed.signedUrl,
    signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS
  }, { status: 201, headers: { "cache-control": "no-store" } });
}
