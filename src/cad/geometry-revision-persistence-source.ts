import { createHash } from "node:crypto";
import { failure, isRecord } from "./geometry-revision-persistence-types";
import type { CanonicalSolid, Completion, GeometryRevisionDatabase, Result, Row } from "./geometry-revision-persistence-types";

type Db = GeometryRevisionDatabase;

function hasCompletionIdentity(row: Row): boolean {
  return typeof row.model_identity_id === "string" && typeof row.execution_id === "string";
}
function hasCompletionEvidence(row: Row): boolean {
  return Array.isArray(row.evidence_records) && row.evidence_records.length > 0 && isRecord(row.validation_receipt);
}
function hasCompletionArtifacts(row: Row): boolean {
  return Array.isArray(row.artifact_records) && Array.isArray(row.storage_objects);
}
function isAcceptedCompletion(row: Row): row is Completion {
  return row.status === "ACCEPTED" && hasCompletionIdentity(row) &&
    hasCompletionEvidence(row) && hasCompletionArtifacts(row) &&
    typeof row.id === "string" && typeof row.project_id === "string";
}

export async function loadCompletion(db: Db, projectId: string, completionId: string): Promise<Result<Completion>> {
  const { data, error } = await db.from("engineering_cad_completions")
    .select("id, project_id, model_identity_id, execution_id, status, specification, artifact_records, evidence_records, validation_receipt, storage_objects, created_by")
    .eq("id", completionId).eq("project_id", projectId).maybeSingle();
  if (error || !data) return failure("Accepted CAD completion was not found in this project.", 404);
  const row = data as unknown as Row;
  if (!isAcceptedCompletion(row)) return failure("Source completion does not satisfy the accepted geometry evidence contract.");
  return { ok: true, value: row };
}

function getSingleSolid(completion: Completion): Result<Row> {
  const solids = completion.artifact_records.filter(isRecord).filter((artifact) => artifact.kind === "SOLID");
  if (solids.length !== 1) return failure("Source completion must contain exactly one canonical SOLID artifact.");
  return { ok: true, value: solids[0] };
}
function hasTrustedProvider(provenance: Row, completion: Completion, projectId: string): boolean {
  const fields = [
    provenance.projectId === projectId,
    provenance.modelIdentityId === completion.model_identity_id,
    provenance.executionId === completion.execution_id,
    typeof provenance.providerId === "string",
    typeof provenance.providerVersion === "string",
    provenance.backend === "build123d" || provenance.backend === "cadquery"
  ];
  return fields.every(Boolean);
}

function resolveProvenance(solid: Row, completion: Completion, projectId: string): Result<Row> {
  const provenance = isRecord(solid.provenance) ? solid.provenance : null;
  if (!provenance) return failure("Canonical SOLID provenance is missing.");
  if (typeof solid.id !== "string" || !solid.id.trim()) return failure("Canonical SOLID artifact id is missing.");
  if (solid.validationStatus !== "PASS") return failure("Canonical SOLID artifact has not passed validation.");
  if (!hasTrustedProvider(provenance, completion, projectId)) {
    return failure("Canonical SOLID provenance does not match its accepted completion.");
  }
  return { ok: true, value: provenance };
}

function resolveStoragePath(solid: Row, completion: Completion, projectId: string): Result<string> {
  const objectPath = [projectId, completion.model_identity_id, completion.execution_id, "solid.brep"].join("/");
  const uri = "storage://engineering-cad-artifacts/" + objectPath;
  if (solid.uri !== uri || !completion.storage_objects.includes(objectPath)) {
    return failure("Canonical BREP object is not bound to the source completion.");
  }
  return { ok: true, value: objectPath };
}

function flatMapResult<T, U>(result: Result<T>, next: (value: T) => Result<U>): Result<U> {
  if (!result.ok) return result;
  return next(result.value);
}
function mapResult<T, U>(result: Result<T>, map: (value: T) => U): Result<U> {
  if (!result.ok) return result;
  return { ok: true, value: map(result.value) };
}
export function resolveCanonicalSolid(completion: Completion, projectId: string): Result<CanonicalSolid> {
  return flatMapResult(getSingleSolid(completion), (solid) =>
    flatMapResult(resolveProvenance(solid, completion, projectId), (provenance) =>
      mapResult(resolveStoragePath(solid, completion, projectId), (objectPath) => ({
        id: solid.id as string, provenance, objectPath
      }))
    )
  );
}

export async function verifyStoredBrep(db: Db, source: CanonicalSolid): Promise<Result<string>> {
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
