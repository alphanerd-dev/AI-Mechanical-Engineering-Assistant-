import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../lib/supabase/service";
import { buildDurableAuditRecord } from "../audit/durable-store";
import { GeometryRevisionV1, validateGeometryRevisionV1 } from "./geometry-revision";

type Row = Record<string, unknown>;
type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
type Completion = {
  id: string; project_id: string; model_identity_id: string; execution_id: string;
  status: string; artifact_records: unknown[]; evidence_records: unknown[];
  validation_receipt: unknown; storage_objects: unknown[]; created_by: string;
};
type CanonicalSolid = { id: string; provenance: Row; objectPath: string };

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function failure<T>(message: string, status = 409): Result<T> {
  return { ok: false, message, status };
}
function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function loadCompletion(db: ReturnType<typeof createServiceRoleClient>, projectId: string, completionId: string): Promise<Result<Completion>> {
  const { data, error } = await db.from("engineering_cad_completions")
    .select("id, project_id, model_identity_id, execution_id, status, artifact_records, evidence_records, validation_receipt, storage_objects, created_by")
    .eq("id", completionId).eq("project_id", projectId).maybeSingle();
  if (error || !data) return failure("Accepted CAD completion was not found in this project.", 404);
  const row = data as unknown as Completion;
  if (row.status !== "ACCEPTED" || typeof row.model_identity_id !== "string" ||
      typeof row.execution_id !== "string" || !Array.isArray(row.evidence_records) ||
      row.evidence_records.length === 0 || !isRecord(row.validation_receipt) ||
      !Array.isArray(row.artifact_records) || !Array.isArray(row.storage_objects)) {
    return failure("Source completion does not satisfy the accepted geometry evidence contract.");
  }
  return { ok: true, value: row };
}

function resolveCanonicalSolid(completion: Completion, projectId: string): Result<CanonicalSolid> {
  const artifacts = completion.artifact_records.filter(isRecord);
  const solids = artifacts.filter((artifact) => artifact.kind === "SOLID");
  if (solids.length !== 1) return failure("Source completion must contain exactly one canonical SOLID artifact.");
  const solid = solids[0];
  const provenance = isRecord(solid.provenance) ? solid.provenance : null;
  if (!provenance || solid.validationStatus !== "PASS" ||
      provenance.projectId !== projectId || provenance.modelIdentityId !== completion.model_identity_id ||
      provenance.executionId !== completion.execution_id ||
      typeof provenance.providerId !== "string" || typeof provenance.providerVersion !== "string" ||
      !["build123d", "cadquery"].includes(String(provenance.backend))) {
    return failure("Canonical SOLID provenance is incomplete or does not match its accepted completion.");
  }
  const objectPath = [projectId, completion.model_identity_id, completion.execution_id, "solid.brep"].join("/");
  if (solid.uri !== "storage://engineering-cad-artifacts/" + objectPath ||
      !completion.storage_objects.includes(objectPath)) {
    return failure("Canonical BREP object is not bound to the source completion.");
  }
  return { ok: true, value: { id: String(solid.id), provenance, objectPath } };
}

async function verifyStoredBrep(
  db: ReturnType<typeof createServiceRoleClient>,
  source: CanonicalSolid
): Promise<Result<string>> {
  const { data, error } = await db.storage.from("engineering-cad-artifacts").download(source.objectPath);
  if (error || !data) return failure("Canonical BREP bytes could not be retrieved from private Storage.", 503);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length < 1 || bytes.length > 100 * 1024 * 1024) {
    return failure("Canonical BREP artifact size is outside the supported limit.", 413);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (source.provenance.artifactSha256 !== digest) {
    return failure("Server-computed BREP digest does not match accepted completion provenance.");
  }
  return { ok: true, value: digest };
}

async function findPriorRevision(
  db: ReturnType<typeof createServiceRoleClient>,
  projectId: string,
  completion: Completion,
  solid: CanonicalSolid,
  digest: string
): Promise<Result<Row | null>> {
  const { data, error } = await db.from("engineering_geometry_revisions").select("*")
    .eq("project_id", projectId).eq("model_identity_id", completion.model_identity_id)
    .eq("source_completion_id", completion.id).eq("canonical_artifact_id", solid.id).maybeSingle();
  if (error) return failure("Geometry revision idempotency lookup failed.", 503);
  if (data && (data.canonical_artifact_sha256 !== digest || data.storage_object_name !== solid.objectPath)) {
    return failure("The source completion is already bound to a different canonical geometry digest.");
  }
  return { ok: true, value: data as Row | null };
}

async function loadRevisionHead(
  db: ReturnType<typeof createServiceRoleClient>,
  projectId: string,
  modelIdentityId: string
): Promise<Result<{ id: string | null; number: number }>> {
  const { data, error } = await db.from("engineering_geometry_revisions").select("id, revision_number")
    .eq("project_id", projectId).eq("model_identity_id", modelIdentityId)
    .order("revision_number", { ascending: false }).limit(1);
  if (error) return failure("Geometry revision head could not be read.", 503);
  const row = Array.isArray(data) && data.length ? data[0] as Row : null;
  return { ok: true, value: { id: typeof row?.id === "string" ? row.id : null, number: Number(row?.revision_number ?? 0) } };
}

function buildRevisionPayload(input: {
  projectId: string; actorId: string; requestId: string; completion: Completion;
  solid: CanonicalSolid; digest: string; parentId: string | null; revisionNumber: number;
}) {
  const { projectId, actorId, requestId, completion, solid, digest, parentId, revisionNumber } = input;
  const revisionId = randomUUID();
  const createdAt = new Date().toISOString();
  const provider = solid.provenance;
  const candidate: GeometryRevisionV1 = {
    schemaVersion: 1, geometryRevisionId: revisionId, projectId,
    modelIdentityId: completion.model_identity_id, geometryRevisionNumber: revisionNumber,
    parentGeometryRevisionId: parentId, sourceCompletionId: completion.id,
    sourceOperationId: completion.execution_id, storageBucket: "engineering-cad-artifacts",
    storageObjectName: solid.objectPath,
    canonicalArtifact: { artifactId: solid.id, artifactKind: "SOLID", format: "BREP",
      artifactSha256: digest, units: "mm", coordinateFrameId: "WORLD_Z_AXIS" },
    provider: { providerId: String(provider.providerId), providerVersion: String(provider.providerVersion),
      executionBackend: provider.backend as "build123d" | "cadquery" },
    createdAt
  };
  const revisionRecord = {
    id: revisionId, project_id: projectId, model_identity_id: completion.model_identity_id,
    revision_number: revisionNumber, parent_revision_id: parentId, source_completion_id: completion.id,
    source_operation_id: completion.execution_id, canonical_artifact_id: solid.id,
    storage_bucket: "engineering-cad-artifacts", storage_object_name: solid.objectPath,
    canonical_artifact_sha256: digest, canonical_format: "BREP", units: "mm",
    coordinate_frame_id: "WORLD_Z_AXIS", provider_id: provider.providerId,
    provider_version: provider.providerVersion, execution_backend: provider.backend, created_by: actorId
  };
  const auditRecord = buildDurableAuditRecord({
    timestamp: createdAt, actor: { subject: actorId, actorType: "USER" },
    action: "EVIDENCE_WRITE", outcome: "SUCCESS", projectId,
    resourceType: "GEOMETRY_REVISION", resourceId: revisionId,
    reason: "Immutable geometry revision persisted from an accepted and independently validated CAD completion.",
    metadata: { revisionNumber, sourceCompletionId: completion.id, canonicalArtifactId: solid.id,
      providerId: provider.providerId, providerVersion: provider.providerVersion },
    correlation: { requestId, taskId: completion.model_identity_id, runId: completion.execution_id,
      providerId: String(provider.providerId), artifactSha256: digest }
  });
  return { candidate, revisionRecord, auditRecord, revisionId };
}

async function commitRevision(
  db: ReturnType<typeof createServiceRoleClient>,
  input: ReturnType<typeof buildRevisionPayload>,
  projectId: string,
  completion: Completion,
  solid: CanonicalSolid,
  digest: string
): Promise<Result<{ revision: Row; audit: Row; replay: boolean }>> {
  const { data, error } = await db.rpc("record_geometry_revision_with_audit", {
    p_revision: input.revisionRecord, p_audit_record: input.auditRecord
  });
  if (!error && isRecord(data) && isRecord(data.revision) && isRecord(data.audit) &&
      data.revision.id === input.revisionId && data.audit.event_id === input.auditRecord.event_id &&
      data.audit.event_hash === input.auditRecord.event_hash) {
    return { ok: true, value: { revision: data.revision, audit: data.audit, replay: false } };
  }
  const { data: reconciled } = await db.from("engineering_geometry_revisions").select("*")
    .eq("project_id", projectId).eq("model_identity_id", completion.model_identity_id)
    .eq("source_completion_id", completion.id).eq("canonical_artifact_id", solid.id).maybeSingle();
  if (reconciled && reconciled.canonical_artifact_sha256 === digest &&
      reconciled.storage_object_name === solid.objectPath) {
    return { ok: true, value: { revision: reconciled as Row, audit: {}, replay: true } };
  }
  return failure("Geometry revision and audit transaction could not be confirmed; reload revision history before retrying.", 503);
}

class GeometryPersistenceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new GeometryPersistenceError(result.message, result.status);
  return result.value;
}

export async function createGeometryRevisionResponse(input: {
  projectId: string; completionId: string; expectedParentRevisionId: string | null;
  actorId: string; requestId: string;
}) {
  const db = createServiceRoleClient();
  try {
    const completion = unwrap(await loadCompletion(db, input.projectId, input.completionId));
    const solid = unwrap(resolveCanonicalSolid(completion, input.projectId));
    const digest = unwrap(await verifyStoredBrep(db, solid));
    const prior = unwrap(await findPriorRevision(db, input.projectId, completion, solid, digest));
    if (prior) return NextResponse.json({ revision: prior, persisted: true, idempotentReplay: true }, { status: 200 });
    const head = unwrap(await loadRevisionHead(db, input.projectId, completion.model_identity_id));
    if (head.id !== input.expectedParentRevisionId) {
      throw new GeometryPersistenceError("STALE_GEOMETRY_REVISION: expected parent is not the current geometry head.", 409);
    }
    const payload = buildRevisionPayload({
      projectId: input.projectId, actorId: input.actorId, requestId: input.requestId,
      completion, solid, digest, parentId: head.id, revisionNumber: head.number + 1
    });
    if (validateGeometryRevisionV1(payload.candidate).status !== "PASS") {
      throw new GeometryPersistenceError("Geometry revision contract failed server validation.", 422);
    }
    const committed = unwrap(await commitRevision(db, payload, input.projectId, completion, solid, digest));
    if (committed.replay) {
      return NextResponse.json({ revision: committed.revision, persisted: true, idempotentReplay: true }, { status: 200 });
    }
    return NextResponse.json({
      revision: payload.candidate, persisted: true,
      audit: { eventId: payload.auditRecord.event_id, chainSequence: committed.audit.chain_sequence }
    }, { status: 201 });
  } catch (error) {
    if (error instanceof GeometryPersistenceError) return responseError(error.message, error.status);
    return responseError("Geometry revision persistence failed without reporting success.", 503);
  }
}
