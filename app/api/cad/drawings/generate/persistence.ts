import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "../../../../../lib/supabase/service";
import { persistEngineeringAuditEvent } from "../../../../../src/audit/server";
import { CAD_ARTIFACT_BUCKET, CAD_SIGNED_URL_TTL_SECONDS } from "../../../../../src/cad/persistence";
import { inspectCADDrawingUpload } from "../../../../../src/drawings/ingestion";
import { generateShaftOrthographicSvgDrawing } from "../../../../../src/drawings/shaft-orthographic";
import { fail } from "./request";

type ServiceDb = ReturnType<typeof createServiceRoleClient>;
type SessionDb = Awaited<ReturnType<typeof import("../../../../../lib/supabase/server").createClient>>;
type Row = Record<string, unknown>;
export interface PersistGeneratedDrawingInput {
  serviceDb: ServiceDb;
  sessionDb: SessionDb;
  subject: string;
  projectId: string;
  modelIdentityId: string;
  revision: Row;
  drawingNumber: string;
  title: string;
  diameterMm: number;
  lengthMm: number;
}
interface PreparedDrawing {
  id: string;
  storagePath: string;
  drawing: ReturnType<typeof generateShaftOrthographicSvgDrawing>;
  row: Row;
}
function prepareDrawing(input: PersistGeneratedDrawingInput, id: string): PreparedDrawing {
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
  const storagePath = input.projectId + "/" + input.modelIdentityId + "/" + id + "/drawing.svg";
  const row: Row = {
    id, project_id: input.projectId, model_identity_id: input.modelIdentityId,
    display_name: input.drawingNumber + ".svg", format: "SVG", media_type: drawing.mediaType,
    byte_size: drawing.bytes.byteLength, sha256: drawing.sha256, storage_object_path: storagePath,
    parser_version: inspected.parserVersion, units: drawing.units, entity_count: drawing.entityCount,
    bounds: drawing.bounds, warnings: [...drawing.warnings, ...inspected.warnings],
    created_by: input.subject, source_geometry_revision_id: input.revision.id,
    source_artifact_id: input.revision.canonical_artifact_id,
    source_artifact_sha256: input.revision.canonical_artifact_sha256,
    source_revision_number: input.revision.revision_number,
    generator_id: drawing.generatorId, generator_version: drawing.generatorVersion,
    generation_parameters: drawing.parameters
  };
  return { id, storagePath, drawing, row };
}
async function uploadDrawing(input: PersistGeneratedDrawingInput, prepared: PreparedDrawing): Promise<void> {
  const result = await input.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).upload(
    prepared.storagePath, prepared.drawing.bytes,
    { upsert: false, contentType: prepared.drawing.mediaType, cacheControl: "3600" }
  );
  if (result.error) {
    await input.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([prepared.storagePath]);
    fail({ message: "Generated drawing could not be stored in private project storage.", status: 503, code: "DRAWING_STORAGE_FAILED" });
  }
}
function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function findExistingDrawing(input: PersistGeneratedDrawingInput, drawing: PreparedDrawing): Promise<Row | undefined> {
  const { data, error } = await input.serviceDb.from("engineering_cad_drawings").select("*")
    .eq("project_id", input.projectId)
    .eq("model_identity_id", input.modelIdentityId)
    .eq("source_geometry_revision_id", input.revision.id)
    .eq("generator_id", drawing.drawing.generatorId)
    .eq("generator_version", drawing.drawing.generatorVersion)
    .eq("sha256", drawing.drawing.sha256)
    .maybeSingle();
  if (error) fail({ message: "Generated drawing commit acknowledgement is ambiguous. Reload drawing history before retrying.", status: 503, code: "DRAWING_COMMIT_AMBIGUOUS" });
  return isRecord(data) ? data : undefined;
}
async function removeUploadedDrawing(input: PersistGeneratedDrawingInput, storagePath: string): Promise<void> {
  const result = await input.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storagePath]);
  if (result.error) fail({ message: "Temporary generated drawing cleanup is unconfirmed.", status: 503, code: "DRAWING_CLEANUP_AMBIGUOUS" });
}
async function insertOrResolveDrawing(input: PersistGeneratedDrawingInput, prepared: PreparedDrawing): Promise<{ row: Row; replay: boolean }> {
  const inserted = await input.serviceDb.from("engineering_cad_drawings").insert(prepared.row);
  if (!inserted.error) return { row: prepared.row, replay: false };
  const existing = await findExistingDrawing(input, prepared);
  await removeUploadedDrawing(input, prepared.storagePath);
  if (existing) return { row: existing, replay: true };
  fail({ message: "Generated drawing metadata could not be committed; the uploaded object was removed.", status: 503, code: "DRAWING_METADATA_FAILED" });
}
async function persistDrawingAudit(input: PersistGeneratedDrawingInput, prepared: PreparedDrawing): Promise<void> {
  try {
    await persistEngineeringAuditEvent({
      timestamp: new Date().toISOString(),
      actor: { subject: input.subject, actorType: "USER" },
      action: "PROJECT_WRITE",
      outcome: "SUCCESS",
      projectId: input.projectId,
      resourceType: "CAD_DRAWING",
      resourceId: prepared.id,
      reason: "A deterministic preliminary shaft drawing was generated from exact accepted geometry revision lineage. No geometry validation, verification or approval state was changed.",
      metadata: {
        format: "SVG", sha256: prepared.drawing.sha256,
        sourceGeometryRevisionId: input.revision.id,
        sourceArtifactId: input.revision.canonical_artifact_id,
        sourceArtifactSha256: input.revision.canonical_artifact_sha256,
        sourceRevisionNumber: input.revision.revision_number,
        generatorId: prepared.drawing.generatorId,
        generatorVersion: prepared.drawing.generatorVersion
      }
    });
  } catch {
    await reconcileDrawingAuditFailure(input, prepared);
  }
}
async function reconcileDrawingAuditFailure(input: PersistGeneratedDrawingInput, prepared: PreparedDrawing): Promise<never> {
  const audit = await input.serviceDb.from("engineering_audit_events").select("event_id")
    .eq("resource_type", "CAD_DRAWING").eq("resource_id", prepared.id).maybeSingle();
  if (audit.data || audit.error) {
    fail({ message: "Generated drawing was committed but audit acknowledgement is ambiguous. Reload drawing history before retrying.", status: 503, code: "DRAWING_AUDIT_AMBIGUOUS" });
  }
  const removed = await input.serviceDb.from("engineering_cad_drawings").delete()
    .eq("id", prepared.id).eq("project_id", input.projectId);
  if (removed.error) fail({ message: "Drawing audit failed and metadata cleanup is unconfirmed.", status: 503, code: "DRAWING_CLEANUP_AMBIGUOUS" });
  await removeUploadedDrawing(input, prepared.storagePath);
  fail({ message: "Generated drawing audit persistence failed; the drawing was removed.", status: 503, code: "DRAWING_AUDIT_FAILED" });
}
async function createDrawingUrl(input: PersistGeneratedDrawingInput, row: Row): Promise<string> {
  const result = await input.sessionDb.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(String(row.storage_object_path), CAD_SIGNED_URL_TTL_SECONDS);
  if (result.error || !result.data?.signedUrl) {
    fail({ message: "Drawing was saved, but a short-lived read URL could not be created. Reload project drawing history.", status: 503, code: "DRAWING_URL_UNAVAILABLE" });
  }
  return result.data.signedUrl;
}
function serializeDrawing(row: Row, signedUrl: string, replay: boolean) {
  return {
    id: row.id, projectId: row.project_id, modelIdentityId: row.model_identity_id,
    displayName: row.display_name, format: row.format, mediaType: row.media_type,
    byteSize: row.byte_size, sha256: row.sha256, parserVersion: row.parser_version,
    units: row.units, entityCount: row.entity_count, bounds: row.bounds, warnings: row.warnings,
    createdAt: row.created_at ?? new Date().toISOString(),
    sourceGeometryRevisionId: row.source_geometry_revision_id,
    sourceArtifactId: row.source_artifact_id, sourceArtifactSha256: row.source_artifact_sha256,
    sourceRevisionNumber: row.source_revision_number, generatorId: row.generator_id,
    generatorVersion: row.generator_version, generationParameters: row.generation_parameters,
    isStale: false, signedUrl, signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS,
    idempotentReplay: replay
  };
}
export async function persistGeneratedDrawing(input: PersistGeneratedDrawingInput) {
  const prepared = prepareDrawing(input, randomUUID());
  await uploadDrawing(input, prepared);
  const persisted = await insertOrResolveDrawing(input, prepared);
  if (!persisted.replay) await persistDrawingAudit(input, prepared);
  const signedUrl = await createDrawingUrl(input, persisted.row);
  return serializeDrawing(persisted.row, signedUrl, persisted.replay);
}
