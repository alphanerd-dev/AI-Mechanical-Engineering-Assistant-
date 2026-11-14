import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../../lib/supabase/service";
import { authorizeSupabaseRequest } from "../../../../../src/auth/supabase-service";
import { buildDurableAuditRecord } from "../../../../../src/audit/durable-store";
import { GeometryRevisionV1, validateGeometryRevisionV1 } from "../../../../../src/cad/geometry-revision";

export const runtime = "nodejs";
type Row = Record<string, unknown>;
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Trusted persistence from an accepted completion; client-supplied digests and paths are ignored. */
export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const body: unknown = await request.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!isRecord(body) || typeof body.projectId !== "string" || !uuid.test(body.projectId) ||
        typeof body.completionId !== "string" || !uuid.test(body.completionId) ||
        !(body.expectedParentRevisionId === null ||
          (typeof body.expectedParentRevisionId === "string" && uuid.test(body.expectedParentRevisionId)))) {
      return fail("A valid projectId, completionId, and expectedParentRevisionId (UUID or null) are required.", 400);
    }
    const projectId = body.projectId;
    const completionId = body.completionId;
    const expectedParent = body.expectedParentRevisionId as string | null;
    const authorization = await authorizeSupabaseRequest("EVIDENCE.WRITE", projectId, { requestId });
    if (!authorization.allowed) return fail(authorization.reason, authorization.reason.includes("unavailable") ? 503 : 403);
    const sessionDb = await createClient();
    const { data: userData, error: userError } = await sessionDb.auth.getUser();
    if (userError || !userData.user || userData.user.id !== authorization.subject) return fail("Authenticated project identity could not be confirmed.", 401);
    const actorId = userData.user.id;
    const db = createServiceRoleClient();
    const { data: completion, error: completionError } = await db.from("engineering_cad_completions")
      .select("id, project_id, model_identity_id, execution_id, status, artifact_records, evidence_records, validation_receipt, storage_objects, created_by")
      .eq("id", completionId).eq("project_id", projectId).maybeSingle();
    if (completionError || !completion) return fail("Accepted CAD completion was not found in this project.", 404);
    if (completion.status !== "ACCEPTED" || completion.created_by !== actorId ||
        typeof completion.model_identity_id !== "string" || typeof completion.execution_id !== "string" ||
        !Array.isArray(completion.evidence_records) || completion.evidence_records.length === 0 ||
        !isRecord(completion.validation_receipt) || !Array.isArray(completion.artifact_records) ||
        !Array.isArray(completion.storage_objects)) {
      return fail("Source completion does not satisfy the accepted geometry evidence contract.", 409);
    }
    const artifacts = completion.artifact_records.filter(isRecord);
    const solids = artifacts.filter((artifact) => artifact.kind === "SOLID");
    if (solids.length !== 1) return fail("Source completion must contain exactly one canonical SOLID artifact.", 409);
    const solid = solids[0];
    const provenance = isRecord(solid.provenance) ? solid.provenance : null;
    if (!provenance || solid.validationStatus !== "PASS" ||
        provenance.projectId !== projectId || provenance.modelIdentityId !== completion.model_identity_id ||
        provenance.executionId !== completion.execution_id ||
        typeof provenance.providerId !== "string" || typeof provenance.providerVersion !== "string" ||
        !["build123d", "cadquery"].includes(String(provenance.backend))) {
      return fail("Canonical SOLID provenance is incomplete or does not match its accepted completion.", 409);
    }
    const objectPath = [projectId, completion.model_identity_id, completion.execution_id, "solid.brep"].join("/");
    if (solid.uri !== "storage://engineering-cad-artifacts/" + objectPath || !completion.storage_objects.includes(objectPath)) {
      return fail("Canonical BREP object is not bound to the source completion.", 409);
    }
    const { data: file, error: downloadError } = await db.storage.from("engineering-cad-artifacts").download(objectPath);
    if (downloadError || !file) return fail("Canonical BREP bytes could not be retrieved from private Storage.", 503);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length < 1 || bytes.length > 100 * 1024 * 1024) return fail("Canonical BREP artifact size is outside the supported limit.", 413);
    const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
    if (provenance.artifactSha256 !== artifactSha256) return fail("Server-computed BREP digest does not match accepted completion provenance.", 409);
    const { data: heads, error: headError } = await db.from("engineering_geometry_revisions")
      .select("id, revision_number").eq("project_id", projectId)
      .eq("model_identity_id", completion.model_identity_id)
      .order("revision_number", { ascending: false }).limit(1);
    if (headError) return fail("Geometry revision head could not be read.", 503);
    const head = Array.isArray(heads) && heads.length ? heads[0] as Row : null;
    const parentId = typeof head?.id === "string" ? head.id : null;
    if (parentId !== expectedParent) return fail("STALE_GEOMETRY_REVISION: expected parent is not the current geometry head.", 409);
    const revisionId = randomUUID();
    const revisionNumber = Number(head?.revision_number ?? 0) + 1;
    const createdAt = new Date().toISOString();
    const candidate: GeometryRevisionV1 = {
      schemaVersion: 1, geometryRevisionId: revisionId, projectId,
      modelIdentityId: completion.model_identity_id, geometryRevisionNumber: revisionNumber,
      parentGeometryRevisionId: parentId, sourceCompletionId: completionId,
      sourceOperationId: completion.execution_id, storageBucket: "engineering-cad-artifacts",
      storageObjectName: objectPath,
      canonicalArtifact: { artifactId: String(solid.id), artifactKind: "SOLID", format: "BREP",
        artifactSha256, units: "mm", coordinateFrameId: "WORLD_Z_AXIS" },
      provider: { providerId: provenance.providerId, providerVersion: provenance.providerVersion,
        executionBackend: provenance.backend as "build123d" | "cadquery" },
      createdAt
    };
    if (validateGeometryRevisionV1(candidate).status !== "PASS") return fail("Geometry revision contract failed server validation.", 422);
    const revisionRecord = {
      id: revisionId, project_id: projectId, model_identity_id: completion.model_identity_id,
      revision_number: revisionNumber, parent_revision_id: parentId, source_completion_id: completionId,
      source_operation_id: completion.execution_id, canonical_artifact_id: String(solid.id),
      storage_bucket: "engineering-cad-artifacts", storage_object_name: objectPath,
      canonical_artifact_sha256: artifactSha256, canonical_format: "BREP", units: "mm",
      coordinate_frame_id: "WORLD_Z_AXIS", provider_id: provenance.providerId,
      provider_version: provenance.providerVersion, execution_backend: provenance.backend, created_by: actorId
    };
    const auditRecord = buildDurableAuditRecord({
      timestamp: createdAt, actor: { subject: actorId, actorType: "USER" },
      action: "EVIDENCE_WRITE", outcome: "SUCCESS", projectId,
      resourceType: "GEOMETRY_REVISION", resourceId: revisionId,
      reason: "Immutable geometry revision persisted from an accepted and independently validated CAD completion.",
      metadata: { revisionNumber, sourceCompletionId: completionId, canonicalArtifactId: String(solid.id),
        providerId: provenance.providerId, providerVersion: provenance.providerVersion },
      correlation: { requestId, taskId: completion.model_identity_id, runId: completion.execution_id,
        providerId: provenance.providerId, artifactSha256 }
    });
    const { data: committed, error: commitError } = await db.rpc("record_geometry_revision_with_audit", {
      p_revision: revisionRecord, p_audit_record: auditRecord
    });
    if (commitError || !isRecord(committed) || !isRecord(committed.revision) || !isRecord(committed.audit)) {
      return fail("Geometry revision and audit transaction could not be confirmed; reload revision history before retrying.", 503);
    }
    if (committed.revision.id !== revisionId || committed.audit.event_id !== auditRecord.event_id ||
        committed.audit.event_hash !== auditRecord.event_hash) return fail("Geometry revision transaction returned an invalid persistence receipt.", 503);
    return NextResponse.json({ revision: candidate, persisted: true,
      audit: { eventId: auditRecord.event_id, chainSequence: committed.audit.chain_sequence } }, { status: 201 });
  } catch {
    return fail("Geometry revision persistence failed without reporting success.", 503);
  }
}
