function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function drawingUploadIdFromBody(body: unknown): string | null {
  const record = asObjectRecord(body);
  const drawing = asObjectRecord(record?.drawing);
  return typeof drawing?.id === "string" && drawing.id.length > 0 ? drawing.id : null;
}

function drawingUploadError(body: unknown): string {
  const error = asObjectRecord(body)?.error;
  return typeof error === "string" ? error : "Drawing upload failed.";
}

async function readDrawingUploadId(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => ({}));
  const id = drawingUploadIdFromBody(body);
  if (response.ok && id) return id;
  throw new Error(drawingUploadError(body));
}

function generatedDrawingId(body: unknown): string | null {
  const record = asObjectRecord(body);
  const drawing = asObjectRecord(record?.drawing);
  return typeof drawing?.id === "string" ? drawing.id : null;
}

function generatedDrawingError(body: unknown): string {
  const error = asObjectRecord(body)?.error;
  return typeof error === "string" ? error : "Preliminary shaft drawing generation failed.";
}

function resolveGeneratedDrawingId(responseOk: boolean, body: unknown): string {
  const id = generatedDrawingId(body);
  if (responseOk && id) return id;
  throw new Error(generatedDrawingError(body));
}

async function readGeneratedDrawingId(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => ({}));
  return resolveGeneratedDrawingId(response.ok, body);
}

export async function submitDrawingUpload(
  projectId: string,
  modelIdentityId: string,
  file: File
): Promise<string> {
  const form = new FormData();
  form.set("projectId", projectId);
  if (modelIdentityId) form.set("modelIdentityId", modelIdentityId);
  form.set("file", file);
  const response = await fetch("/api/cad/drawings", { method: "POST", body: form });
  return readDrawingUploadId(response);
}

type AcceptedCADCompletion = Record<string, unknown> & { id: string };

function isAcceptedCADCompletion(value: unknown, modelIdentityId: string): value is AcceptedCADCompletion {
  const row = asObjectRecord(value);
  return row?.status === "ACCEPTED" &&
    row.model_identity_id === modelIdentityId &&
    typeof row.id === "string" &&
    row.id.length > 0;
}

function completionTimestamp(completion: AcceptedCADCompletion): number {
  const timestamp = Date.parse(String(completion.created_at ?? ""));
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

interface ModelCompletionScope {
  projectId: string;
  modelIdentityId: string;
}

async function readLatestAcceptedCompletion(
  scope: ModelCompletionScope
): Promise<AcceptedCADCompletion> {
  const projectQuery = "projectId=" + encodeURIComponent(scope.projectId);
  const response = await fetch("/api/cad/completions?" + projectQuery, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => ({}));
  const completions = asObjectRecord(body)?.completions;
  if (!response.ok || !Array.isArray(completions)) {
    throw new Error(generatedDrawingError(body));
  }

  const latestCompletion = completions
    .filter((value): value is AcceptedCADCompletion => isAcceptedCADCompletion(value, scope.modelIdentityId))
    .sort((left, right) => completionTimestamp(right) - completionTimestamp(left))[0];
  if (!latestCompletion) {
    throw new Error("An accepted CAD completion for this model is required before generating a preliminary drawing.");
  }
  return latestCompletion;
}

interface GeometryRevisionHead {
  revisionId: string | null;
  sourceCompletionId: unknown;
}

function requireGeometryRevisionList(responseOk: boolean, body: unknown): unknown[] {
  const revisions = asObjectRecord(body)?.revisions;
  if (!responseOk || !Array.isArray(revisions)) {
    throw new Error(generatedDrawingError(body));
  }
  return revisions;
}

function geometryRevisionHeadFromList(revisions: unknown[]): GeometryRevisionHead {
  const head = revisions.length ? asObjectRecord(revisions[revisions.length - 1]) : null;
  return {
    revisionId: typeof head?.id === "string" ? head.id : null,
    sourceCompletionId: head?.source_completion_id
  };
}

async function readCurrentGeometryRevisionHead(
  scope: ModelCompletionScope
): Promise<GeometryRevisionHead> {
  const query = new URLSearchParams(scope);
  const response = await fetch("/api/cad/geometry/revisions?" + query.toString(), { cache: "no-store" });
  const body: unknown = await response.json().catch(() => ({}));
  return geometryRevisionHeadFromList(requireGeometryRevisionList(response.ok, body));
}

interface AppendGeometryRevisionInput {
  projectId: string;
  completionId: string;
  expectedParentRevisionId: string | null;
}

function geometryRevisionIdFromBody(body: unknown): string | null {
  const revision = asObjectRecord(asObjectRecord(body)?.revision);
  if (typeof revision?.geometryRevisionId === "string") return revision.geometryRevisionId;
  return typeof revision?.id === "string" ? revision.id : null;
}

function resolveGeometryRevisionId(responseOk: boolean, body: unknown): string {
  const revisionId = geometryRevisionIdFromBody(body);
  if (responseOk && revisionId) return revisionId;
  throw new Error(generatedDrawingError(body));
}

async function appendGeometryRevision(input: AppendGeometryRevisionInput): Promise<string> {
  const response = await fetch("/api/cad/geometry/revisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const body: unknown = await response.json().catch(() => ({}));
  return resolveGeometryRevisionId(response.ok, body);
}

async function ensureCurrentGeometryRevision(scope: ModelCompletionScope): Promise<string> {
  const latestCompletion = await readLatestAcceptedCompletion(scope);
  const currentHead = await readCurrentGeometryRevisionHead(scope);
  if (currentHead.revisionId && currentHead.sourceCompletionId === latestCompletion.id) {
    return currentHead.revisionId;
  }
  return appendGeometryRevision({
    projectId: scope.projectId,
    completionId: latestCompletion.id,
    expectedParentRevisionId: currentHead.revisionId
  });
}

export async function submitShaftDrawingGeneration(
  projectId: string,
  modelIdentityId: string
): Promise<string> {
  const geometryRevisionId = await ensureCurrentGeometryRevision({ projectId, modelIdentityId });
  const response = await fetch("/api/cad/drawings/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, modelIdentityId, geometryRevisionId })
  });
  return readGeneratedDrawingId(response);
}
