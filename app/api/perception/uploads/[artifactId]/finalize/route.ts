import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../../../src/auth/supabase-service";
import { buildDurableAuditRecord } from "../../../../../../src/audit/durable-store";
import {
  PointCloudUploadVerificationError,
  PointCloudUploadVerifier,
} from "../../../../../../src/perception/upload-verifier";
import {
  POINT_CLOUD_ARTIFACT_BUCKET,
  type PointCloudUploadFormat,
  pointCloudStorageUri,
} from "../../../../../../src/perception/uploads";

export const runtime = "nodejs";
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16 * 1024;
const COLUMNS = "id,project_id,created_by,file_name,format,units,coordinate_frame,storage_bucket,storage_path,expected_size_bytes,sha256,declared_point_count,status,failure_code,created_at,upload_expires_at,uploaded_at";
type Row = Record<string, unknown>;
type TerminalStatus = "FAILED" | "EXPIRED";

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", pragma: "no-cache", "referrer-policy": "no-referrer" } });
}
function view(row: Row) {
  const isUploaded = row.status === "UPLOADED";
  const storagePath = typeof row.storage_path === "string" ? row.storage_path : "";
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
    artifactUri: isUploaded && storagePath ? pointCloudStorageUri(storagePath) : null,
    inspectionStatus: isUploaded ? "PENDING_OPEN3D_INSPECTION" : "NOT_STARTED",
  };
}
function auditReceipt(value: unknown, expected: { event_id: string; event_hash: string }) {
  if (!isRecord(value) || value.event_id !== expected.event_id || value.event_hash !== expected.event_hash ||
      !Number.isSafeInteger(Number(value.chain_sequence)) || Number(value.chain_sequence) < 1 ||
      typeof value.chain_hash !== "string" || !/^[a-f0-9]{64}$/.test(value.chain_hash)) return null;
  return { eventId: value.event_id, chainSequence: Number(value.chain_sequence), eventHash: value.event_hash, chainHash: value.chain_hash };
}
async function readBody(request: Request): Promise<Row | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = await request.text().catch(() => "");
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch { return null; }
}
function trustedStorageDownloadUrl(value: unknown): string | null {
  const configured = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!configured || typeof value !== "string" || !value) return null;
  try {
    const base = new URL(configured);
    const candidate = new URL(value, base);
    if (base.protocol !== "https:" || candidate.protocol !== "https:" ||
        candidate.origin !== base.origin || candidate.username || candidate.password) return null;
    return candidate.toString();
  } catch { return null; }
}

async function terminateUpload(
  db: ReturnType<typeof createServiceRoleClient>,
  row: Row,
  projectId: string,
  artifactId: string,
  subject: string,
  requestId: string,
  status: TerminalStatus,
  failureCode: string,
): Promise<{ stateClosed: boolean; auditCommitted: boolean; cleanupStatus: "COMPLETED" | "PENDING" }> {
  const path = String(row.storage_path ?? "");
  const removed = await db.storage.from(POINT_CLOUD_ARTIFACT_BUCKET).remove([path]);
  const cleanupStatus = removed.error ? "PENDING" : "COMPLETED";
  const audit = buildDurableAuditRecord({
    timestamp: new Date().toISOString(),
    actor: { subject, actorType: "USER" },
    action: "EVIDENCE_WRITE",
    outcome: "FAILURE",
    projectId,
    resourceType: "POINT_CLOUD_ARTIFACT",
    resourceId: artifactId,
    reason: "Point-cloud source upload was closed without accepting it as usable engineering evidence.",
    metadata: { status, failureCode, format: row.format, byteSize: Number(row.expected_size_bytes), cleanupStatus },
    correlation: { requestId, taskId: artifactId },
  });
  const result = await db.rpc("fail_engineering_point_cloud_upload_with_audit", {
    p_artifact_id: artifactId,
    p_project_id: projectId,
    p_terminal_status: status,
    p_failure_code: failureCode,
    p_audit_record: audit,
  });
  const output = isRecord(result.data) ? result.data : null;
  const committed = !result.error && output !== null && isRecord(output.artifact) &&
    output.artifact.id === artifactId && output.artifact.status === status &&
    auditReceipt(output.audit, audit) !== null;
  if (committed) return { stateClosed: true, auditCommitted: true, cleanupStatus };

  // Compensate only to prevent a still-valid signed token from finalizing again.
  // This fallback is not an audited success; the API reports that distinction.
  const fallback = await db.from("engineering_point_cloud_artifacts")
    .update({ status, failure_code: failureCode, sha256: null, declared_point_count: null, uploaded_at: null })
    .eq("id", artifactId)
    .eq("project_id", projectId)
    .eq("status", "UPLOADING")
    .select("id,status")
    .maybeSingle();
  return {
    stateClosed: !fallback.error && fallback.data?.id === artifactId && fallback.data?.status === status,
    auditCommitted: false,
    cleanupStatus,
  };
}

/** Finalize after streaming the exact private object through SHA-256 and bounded preflight. */
export async function POST(request: Request, context: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await context.params;
  if (!UUID.test(artifactId)) return json({ error: "A point-cloud artifact UUID is required." }, 400);
  const input = await readBody(request);
  if (!input) return json({ error: "Request body must be a JSON object no larger than 16 KiB." }, 400);
  if (Object.keys(input).some((key) => key !== "projectId")) return json({ error: "Only projectId is accepted." }, 400);
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  if (!UUID.test(projectId)) return json({ error: "A registered project UUID is required." }, 400);

  const requestId = randomUUID();
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.WRITE", projectId, { requestId, taskId: artifactId });
    if (!authorization.allowed) {
      const status = authorizationFailureStatus(authorization);
      return json({ error: authorization.reason, code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED" }, status);
    }

    const db = createServiceRoleClient();
    const loaded = await db.from("engineering_point_cloud_artifacts").select(COLUMNS)
      .eq("id", artifactId).eq("project_id", projectId).maybeSingle();
    if (loaded.error) return json({ error: "Point-cloud upload intent could not be loaded." }, 503);
    if (!loaded.data) return json({ error: "Point-cloud upload was not found in this project." }, 404);
    const row = loaded.data as unknown as Row;

    if (row.status === "UPLOADED") return json({ artifact: view(row), finalized: true, idempotent: true });
    if (row.status !== "UPLOADING") {
      return json({ error: "This upload intent is no longer finalizable.", code: "UPLOAD_NOT_FINALIZABLE", status: row.status }, 409);
    }
    const expiresAt = Date.parse(String(row.upload_expires_at ?? ""));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      const closed = await terminateUpload(db, row, projectId, artifactId, authorization.subject, requestId, "EXPIRED", "UPLOAD_TOKEN_EXPIRED");
      if (!closed.stateClosed || !closed.auditCommitted) {
        return json({ error: "The upload expired but the state/audit transition could not be fully confirmed.", code: "UPLOAD_EXPIRY_UNCONFIRMED", cleanupStatus: closed.cleanupStatus }, 503);
      }
      return json({ error: "The signed upload token expired; create a new upload intent.", code: "UPLOAD_TOKEN_EXPIRED", cleanupStatus: closed.cleanupStatus }, 410);
    }

    const signed = await db.storage.from(POINT_CLOUD_ARTIFACT_BUCKET).createSignedUrl(String(row.storage_path), 60);
    if (signed.error || !signed.data?.signedUrl) {
      return json({ error: "The source object is not available yet; upload it before finalizing.", code: "UPLOAD_OBJECT_NOT_AVAILABLE" }, 409);
    }
    const url = trustedStorageDownloadUrl(signed.data.signedUrl);
    if (!url) return json({ error: "Trusted private Storage download configuration is invalid." }, 503);

    const verifier = new PointCloudUploadVerifier(String(row.format) as PointCloudUploadFormat, Number(row.expected_size_bytes));
    let verified;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const fetched = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(100_000) });
      if (!fetched.ok || !fetched.body) {
        if (fetched.status === 404) return json({ error: "The source object is not available yet; upload it before finalizing.", code: "UPLOAD_OBJECT_NOT_AVAILABLE" }, 409);
        return json({ error: "The private source object could not be read for verification.", code: "UPLOAD_READ_FAILED" }, 503);
      }
      reader = fetched.body.getReader();
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        verifier.push(item.value);
      }
      verified = verifier.finish();
    } catch (error) {
      await reader?.cancel().catch(() => undefined);
      if (error instanceof PointCloudUploadVerificationError) {
        const closed = await terminateUpload(db, row, projectId, artifactId, authorization.subject, requestId, "FAILED", error.code);
        if (!closed.stateClosed || !closed.auditCommitted) {
          return json({ error: "The invalid upload was detected but the terminal state/audit transition could not be fully confirmed.", code: "UPLOAD_FAILURE_UNCONFIRMED", cleanupStatus: closed.cleanupStatus }, 503);
        }
        return json({ error: "The upload failed bounded host-side preflight verification.", code: error.code, status: "FAILED", cleanupStatus: closed.cleanupStatus }, 422);
      }
      return json({ error: "The private source object could not be streamed to completion; the upload remains pending.", code: "UPLOAD_READ_INTERRUPTED" }, 503);
    }

    const audit = buildDurableAuditRecord({
      timestamp: new Date().toISOString(),
      actor: { subject: authorization.subject, actorType: "USER" },
      action: "EVIDENCE_WRITE",
      outcome: "SUCCESS",
      projectId,
      resourceType: "POINT_CLOUD_ARTIFACT",
      resourceId: artifactId,
      reason: "The exact private upload bytes were hashed and passed bounded format/header/point-count preflight; Open3D inspection remains pending.",
      metadata: {
        status: "UPLOADED",
        format: verified.format,
        units: row.units,
        coordinateFrame: row.coordinate_frame,
        byteSize: verified.byteSize,
        declaredPointCount: verified.declaredPointCount,
        sourceSha256: verified.sha256,
        verification: verified.verification,
        inspectionStatus: verified.inspectionStatus,
      },
      correlation: { requestId, taskId: artifactId, artifactSha256: verified.sha256 },
    });
    const finalResult = await db.rpc("finalize_engineering_point_cloud_upload_with_audit", {
      p_artifact_id: artifactId,
      p_project_id: projectId,
      p_sha256: verified.sha256,
      p_declared_point_count: verified.declaredPointCount,
      p_audit_record: audit,
    });
    const finalBody = isRecord(finalResult.data) ? finalResult.data : null;
    const stored = finalBody && isRecord(finalBody.artifact) ? finalBody.artifact : null;
    const persistedAudit = finalBody ? auditReceipt(finalBody.audit, audit) : null;
    if (finalResult.error || !stored || stored.status !== "UPLOADED" || stored.sha256 !== verified.sha256 || !persistedAudit) {
      // A transport can fail after the PostgreSQL transaction commits. Read state before
      // allowing another finalize call; never claim success from an unconfirmed write.
      const current = await db.from("engineering_point_cloud_artifacts").select(COLUMNS)
        .eq("id", artifactId).eq("project_id", projectId).maybeSingle();
      if (current.data?.status === "UPLOADED" && current.data.sha256 === verified.sha256) {
        return json({ artifact: view(current.data as unknown as Row), finalized: true, idempotent: true });
      }
      return json({ error: "Upload finalization could not be confirmed; it remains safe to call finalize again.", code: "UPLOAD_FINALIZATION_UNCONFIRMED" }, 503);
    }

    return json({
      artifact: view(stored),
      finalized: true,
      audit: persistedAudit,
      inspectionStatus: verified.inspectionStatus,
      warning: "Header, declared point count, byte length, and SHA-256 were verified by the host. Open3D coordinate inspection and registration acceptance have not run.",
    });
  } catch {
    return json({ error: "Point-cloud finalization service is unavailable." }, 503);
  }
}
