import { randomUUID } from "node:crypto";
import { buildDurableAuditRecord } from "../audit/durable-store";
import type { GeometryRevisionV1 } from "./geometry-revision";
import { failure, isRecord } from "./geometry-revision-persistence-types";
import type { CanonicalSolid, Completion, GeometryRevisionDatabase, Result, Row } from "./geometry-revision-persistence-types";

type Db = GeometryRevisionDatabase;
export type RevisionPayload = { candidate: GeometryRevisionV1; revisionRecord: Row; auditRecord: Row; revisionId: string };
export type RevisionHead = { id: string | null; number: number };

function matchesExistingRevision(row: Row, digest: string, objectPath: string): boolean {
  return row.canonical_artifact_sha256 === digest && row.storage_object_name === objectPath;
}
export async function findPriorRevision(input: {
  db: Db; projectId: string; completion: Completion; solid: CanonicalSolid; digest: string;
}): Promise<Result<Row | null>> {
  const { db, projectId, completion, solid, digest } = input;
  const { data, error } = await db.from("engineering_geometry_revisions").select("*")
    .eq("project_id", projectId).eq("model_identity_id", completion.model_identity_id)
    .eq("source_completion_id", completion.id).eq("canonical_artifact_id", solid.id).maybeSingle();
  if (error) return failure("Geometry revision idempotency lookup failed.", 503);
  if (data !== null && data !== undefined && !isRecord(data)) {
    return failure("Geometry revision idempotency lookup returned an invalid record.", 503);
  }
  if (isRecord(data) && !matchesExistingRevision(data, digest, solid.objectPath)) {
    return failure("The source completion is already bound to a different canonical geometry digest.");
  }
  return { ok: true, value: isRecord(data) ? data : null };
}
export async function loadRevisionHead(input: {
  db: Db; projectId: string; modelIdentityId: string;
}): Promise<Result<RevisionHead>> {
  const { data, error } = await input.db.from("engineering_geometry_revisions").select("id, revision_number")
    .eq("project_id", input.projectId).eq("model_identity_id", input.modelIdentityId)
    .order("revision_number", { ascending: false }).limit(1);
  if (error) return failure("Geometry revision head could not be read.", 503);
  const row = Array.isArray(data) && data.length ? data[0] as Row : null;
  return { ok: true, value: { id: typeof row?.id === "string" ? row.id : null, number: Number(row?.revision_number ?? 0) } };
}

function buildCandidate(input: {
  revisionId: string; createdAt: string; projectId: string; completion: Completion;
  solid: CanonicalSolid; digest: string; parentId: string | null; revisionNumber: number;
}): GeometryRevisionV1 {
  const { revisionId, createdAt, projectId, completion, solid, digest, parentId, revisionNumber } = input;
  const provider = solid.provenance;
  return {
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
}
function buildRevisionRecord(input: {
  revisionId: string; projectId: string; actorId: string; completion: Completion;
  solid: CanonicalSolid; digest: string; parentId: string | null; revisionNumber: number;
}): Row {
  const { revisionId, projectId, actorId, completion, solid, digest, parentId, revisionNumber } = input;
  const provider = solid.provenance;
  return {
    id: revisionId, project_id: projectId, model_identity_id: completion.model_identity_id,
    revision_number: revisionNumber, parent_revision_id: parentId, source_completion_id: completion.id,
    source_operation_id: completion.execution_id, canonical_artifact_id: solid.id,
    storage_bucket: "engineering-cad-artifacts", storage_object_name: solid.objectPath,
    canonical_artifact_sha256: digest, canonical_format: "BREP", units: "mm",
    coordinate_frame_id: "WORLD_Z_AXIS", provider_id: provider.providerId,
    provider_version: provider.providerVersion, execution_backend: provider.backend, created_by: actorId
  };
}
function buildAuditRecord(input: {
  revisionId: string; createdAt: string; projectId: string; actorId: string; requestId: string;
  completion: Completion; solid: CanonicalSolid; digest: string; revisionNumber: number;
}): Row {
  const { revisionId, createdAt, projectId, actorId, requestId, completion, solid, digest, revisionNumber } = input;
  const provider = solid.provenance;
  return buildDurableAuditRecord({
    timestamp: createdAt, actor: { subject: actorId, actorType: "USER" },
    action: "EVIDENCE_WRITE", outcome: "SUCCESS", projectId,
    resourceType: "GEOMETRY_REVISION", resourceId: revisionId,
    reason: "Immutable geometry revision persisted from an accepted and independently validated CAD completion.",
    metadata: { revisionNumber, sourceCompletionId: completion.id, canonicalArtifactId: solid.id,
      providerId: provider.providerId, providerVersion: provider.providerVersion },
    correlation: { requestId, taskId: completion.model_identity_id, runId: completion.execution_id,
      providerId: String(provider.providerId), artifactSha256: digest }
  }) as unknown as Row;
}
export function buildRevisionPayload(input: {
  projectId: string; actorId: string; requestId: string; completion: Completion;
  solid: CanonicalSolid; digest: string; parentId: string | null; revisionNumber: number;
}): RevisionPayload {
  const revisionId = randomUUID();
  const createdAt = new Date().toISOString();
  const candidate = buildCandidate({ ...input, revisionId, createdAt });
  const revisionRecord = buildRevisionRecord({ ...input, revisionId });
  const auditRecord = buildAuditRecord({ ...input, revisionId, createdAt });
  return { candidate, revisionRecord, auditRecord, revisionId };
}

function isCommitReceiptShape(data: unknown): data is Row {
  return isRecord(data) && isRecord(data.revision) && isRecord(data.audit);
}
function matchesRevisionReceipt(data: Row, input: RevisionPayload): boolean {
  return isRecord(data.revision) && data.revision.id === input.revisionId;
}
function matchesAuditReceipt(data: Row, input: RevisionPayload): boolean {
  if (!isRecord(data.audit)) return false;
  if (data.audit.event_id !== input.auditRecord.event_id) return false;
  return data.audit.event_hash === input.auditRecord.event_hash;
}
function validCommitReceipt(data: unknown, input: RevisionPayload): data is Row {
  if (!isCommitReceiptShape(data)) return false;
  if (!matchesRevisionReceipt(data, input)) return false;
  return matchesAuditReceipt(data, input);
}
export async function commitRevision(input: {
  db: Db; payload: RevisionPayload; projectId: string; completion: Completion;
  solid: CanonicalSolid; digest: string;
}): Promise<Result<{ revision: Row; audit: Row; replay: boolean }>> {
  const { db, payload, projectId, completion, solid, digest } = input;
  const { data, error } = await db.rpc("record_geometry_revision_with_audit", {
    p_revision: payload.revisionRecord, p_audit_record: payload.auditRecord
  });
  if (!error && validCommitReceipt(data, payload)) {
    return { ok: true, value: { revision: data.revision as Row, audit: data.audit as Row, replay: false } };
  }
  const { data: reconciled } = await db.from("engineering_geometry_revisions").select("*")
    .eq("project_id", projectId).eq("model_identity_id", completion.model_identity_id)
    .eq("source_completion_id", completion.id).eq("canonical_artifact_id", solid.id).maybeSingle();
  if (isRecord(reconciled) && matchesExistingRevision(reconciled, digest, solid.objectPath)) {
    return { ok: true, value: { revision: reconciled, audit: {}, replay: true } };
  }
  return failure("Geometry revision and audit transaction could not be confirmed; reload revision history before retrying.", 503);
}
