import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { buildDurableAuditRecord } from "../../../../src/audit/durable-store";
import {
  POINT_CLOUD_ARTIFACT_BUCKET,
  POINT_CLOUD_UPLOAD_MAX_BYTES,
  pointCloudStoragePath,
  pointCloudStorageUri,
  type PointCloudUploadFormat,
} from "../../../../src/perception/uploads";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16 * 1024;
const FORMATS = new Set(["PLY", "PCD", "XYZ"]);
const UNITS = new Set(["mm", "cm", "m", "in"]);
const COLUMNS = "id,project_id,file_name,format,units,coordinate_frame,storage_bucket,storage_path,expected_size_bytes,sha256,declared_point_count,status,failure_code,created_at,upload_expires_at,uploaded_at";
type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", pragma: "no-cache", "referrer-policy": "no-referrer" } });
}
function view(row: Row) {
  const isUploaded = row.status === "UPLOADED";
  const objectPath = typeof row.storage_path === "string" ? row.storage_path : "";
  return {
    id: String(row.id ?? ""),
    projectId: String(row.project_id ?? ""),
    fileName: String(row.file_name ?? ""),
    format: String(row.format ?? ""),
    units: String(row.units ?? ""),
    coordinateFrame: String(row.coordinate_frame ?? ""),
    byteSize: Number(row.expected_size_bytes ?? 0),
    sha256: typeof row.sha256 === "string" ? row.sha256 : null,
    declaredPointCount: Number.isInteger(Number(row.declared_point_count)) ? Number(row.declared_point_count) : null,
    status: String(row.status ?? ""),
    failureCode: typeof row.failure_code === "string" ? row.failure_code : null,
    createdAt: String(row.created_at ?? ""),
    uploadExpiresAt: String(row.upload_expires_at ?? ""),
    uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
    artifactUri: isUploaded && objectPath ? pointCloudStorageUri(objectPath) : null,
    inspectionStatus: isUploaded ? "PENDING_OPEN3D_INSPECTION" : "NOT_STARTED",
  };
}
function receipt(value: unknown, expected: { event_id: string; event_hash: string }) {
  if (!isRecord(value) || value.event_id !== expected.event_id || value.event_hash !== expected.event_hash ||
      !Number.isSafeInteger(Number(value.chain_sequence)) || Number(value.chain_sequence) < 1 ||
      typeof value.chain_hash !== "string" || !/^[a-f0-9]{64}$/.test(value.chain_hash)) return null;
  return { eventId: value.event_id, chainSequence: Number(value.chain_sequence), eventHash: value.event_hash, chainHash: value.chain_hash };
}
async function body(request: Request): Promise<Row | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = await request.text().catch(() => "");
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch { return null; }
}

/** Project-authorized metadata listing; never exposes signed download URLs. */
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!UUID.test(projectId)) return json({ error: "A registered project UUID is required." }, 400);
  try {
    const auth = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!auth.allowed) {
      const status = authorizationFailureStatus(auth);
      return json({ error: auth.reason, code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED" }, status);
    }
    const db = createServiceRoleClient();
    const result = await db.from("engineering_point_cloud_artifacts").select(COLUMNS)
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    if (result.error || !Array.isArray(result.data)) return json({ error: "Point-cloud upload history could not be loaded." }, 503);
    return json({ projectId, uploads: result.data.map((row) => view(row as unknown as Row)), count: result.data.length });
  } catch {
    return json({ error: "Point-cloud upload service is unavailable." }, 503);
  }
}

/** Create a project-scoped upload intent and one-object, non-upsert signed upload token. */
export async function POST(request: Request) {
  const input = await body(request);
  if (!input) return json({ error: "Request body must be a JSON object no larger than 16 KiB." }, 400);
  const allowedKeys = new Set(["projectId", "fileName", "format", "units", "coordinateFrame", "byteSize"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return json({ error: "Unexpected request field." }, 400);

  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  const format = input.format;
  const units = input.units;
  const frame = typeof input.coordinateFrame === "string" ? input.coordinateFrame.trim() : "";
  const bytes = input.byteSize;
  if (!UUID.test(projectId)) return json({ error: "A registered project UUID is required." }, 400);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,159}$/.test(fileName) ||
      fileName === "." || fileName === ".." || !FORMATS.has(String(format)) ||
      !fileName.toLowerCase().endsWith("." + String(format).toLowerCase())) {
    return json({ error: "fileName must be a simple filename with a matching PLY, PCD, or XYZ extension." }, 400);
  }
  if (typeof units !== "string" || !UNITS.has(units)) return json({ error: "Explicit units (mm, cm, m, or in) are required." }, 400);
  if (!frame || frame.length > 128 || /[\u0000-\u001f\u007f]/.test(frame)) return json({ error: "coordinateFrame must contain 1–128 printable characters." }, 400);
  if (!Number.isSafeInteger(bytes) || Number(bytes) < 1 || Number(bytes) > POINT_CLOUD_UPLOAD_MAX_BYTES) {
    return json({ error: "Point-cloud file size must be a positive integer no larger than 40 MiB." }, 413);
  }

  const requestId = randomUUID();
  try {
    const auth = await authorizeSupabaseRequest("PROJECT.WRITE", projectId, { requestId });
    if (!auth.allowed) {
      const status = authorizationFailureStatus(auth);
      return json({ error: auth.reason, code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED" }, status);
    }
    const db = createServiceRoleClient();
    const id = randomUUID();
    const normalizedFormat = String(format) as PointCloudUploadFormat;
    const storagePath = pointCloudStoragePath(projectId, id, normalizedFormat);
    const signedResult = await db.storage.from(POINT_CLOUD_ARTIFACT_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
    if (signedResult.error || !signedResult.data?.token) return json({ error: "A private, single-object upload token could not be issued." }, 503);

    const audit = buildDurableAuditRecord({
      timestamp: new Date().toISOString(),
      actor: { subject: auth.subject, actorType: "USER" },
      action: "EVIDENCE_WRITE",
      outcome: "PENDING",
      projectId,
      resourceType: "POINT_CLOUD_ARTIFACT",
      resourceId: id,
      reason: "A bounded point-cloud upload intent was created; source bytes have not been verified.",
      metadata: { format: normalizedFormat, units, coordinateFrame: frame, byteSize: Number(bytes), status: "UPLOADING", storageBucket: POINT_CLOUD_ARTIFACT_BUCKET },
      correlation: { requestId, taskId: id },
    });
    const createdResult = await db.rpc("create_engineering_point_cloud_upload_with_audit", {
      p_artifact: {
        id, project_id: projectId, created_by: auth.subject, file_name: fileName,
        format: normalizedFormat, units, coordinate_frame: frame,
        storage_bucket: POINT_CLOUD_ARTIFACT_BUCKET, storage_path: storagePath,
        expected_size_bytes: Number(bytes),
      },
      p_audit_record: audit,
    });
    const result = isRecord(createdResult.data) ? createdResult.data : null;
    if (createdResult.error || !result) {
      await db.storage.from(POINT_CLOUD_ARTIFACT_BUCKET).remove([storagePath]).catch(() => undefined);
      return json({ error: "The upload intent and pending audit event could not be committed." }, 503);
    }
    if (result.errorCode === "TOO_MANY_PENDING_UPLOADS" || result.errorCode === "PROJECT_NOT_FOUND") {
      await db.storage.from(POINT_CLOUD_ARTIFACT_BUCKET).remove([storagePath]).catch(() => undefined);
      return result.errorCode === "TOO_MANY_PENDING_UPLOADS"
        ? json({ error: "This project already has five unexpired pending uploads.", code: result.errorCode }, 429)
        : json({ error: "Project not found or inaccessible." }, 404);
    }
    const row = isRecord(result.artifact) ? result.artifact : null;
    const committedAudit = receipt(result.audit, audit);
    if (!row || row.id !== id || row.status !== "UPLOADING" || !committedAudit) {
      await db.storage.from(POINT_CLOUD_ARTIFACT_BUCKET).remove([storagePath]).catch(() => undefined);
      return json({ error: "The upload intent could not be verified against its durable audit event." }, 503);
    }
    return json({
      artifact: view(row),
      upload: {
        bucket: POINT_CLOUD_ARTIFACT_BUCKET,
        storagePath,
        uploadToken: signedResult.data.token,
        method: "uploadToSignedUrl",
        expiresAt: String(row.upload_expires_at),
        maxBytes: POINT_CLOUD_UPLOAD_MAX_BYTES,
      },
      audit: committedAudit,
    }, 201);
  } catch {
    return json({ error: "Point-cloud upload service is unavailable." }, 503);
  }
}
