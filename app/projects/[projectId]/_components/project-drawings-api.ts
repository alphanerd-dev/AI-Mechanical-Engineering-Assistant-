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

async function ensureCurrentGeometryRevision(
  projectId: string,
  modelIdentityId: string
): Promise<string> {
  const projectQuery = "projectId=" + encodeURIComponent(projectId);
  const completionsResponse = await fetch("/api/cad/completions?" + projectQuery, { cache: "no-store" });
  const completionsBody: unknown = await completionsResponse.json().catch(() => ({}));
  const completions = asObjectRecord(completionsBody)?.completions;
  if (!completionsResponse.ok || !Array.isArray(completions)) {
    throw new Error(generatedDrawingError(completionsBody));
  }

  const accepted = completions
    .filter((value): value is Record<string, unknown> => {
      const row = asObjectRecord(value);
      return row?.status === "ACCEPTED" && row.model_identity_id === modelIdentityId &&
        typeof row.id === "string" && row.id.length > 0;
    })
    .sort((a, b) => Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")));
  const latestCompletion = accepted[0];
  if (!latestCompletion || typeof latestCompletion.id !== "string") {
    throw new Error("An accepted CAD completion for this model is required before generating a preliminary drawing.");
  }

  const revisionQuery = new URLSearchParams({ projectId, modelIdentityId });
  const revisionsResponse = await fetch("/api/cad/geometry/revisions?" + revisionQuery.toString(), { cache: "no-store" });
  const revisionsBody: unknown = await revisionsResponse.json().catch(() => ({}));
  const revisions = asObjectRecord(revisionsBody)?.revisions;
  if (!revisionsResponse.ok || !Array.isArray(revisions)) {
    throw new Error(generatedDrawingError(revisionsBody));
  }
  const currentHead = revisions.length ? asObjectRecord(revisions[revisions.length - 1]) : null;
  const currentHeadId = typeof currentHead?.id === "string" ? currentHead.id : null;
  if (currentHeadId && currentHead?.source_completion_id === latestCompletion.id) {
    return currentHeadId;
  }

  const revisionResponse = await fetch("/api/cad/geometry/revisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      completionId: latestCompletion.id,
      expectedParentRevisionId: currentHeadId
    })
  });
  const revisionBody: unknown = await revisionResponse.json().catch(() => ({}));
  const revision = asObjectRecord(asObjectRecord(revisionBody)?.revision);
  const revisionId = typeof revision?.geometryRevisionId === "string"
    ? revision.geometryRevisionId
    : typeof revision?.id === "string" ? revision.id : null;
  if (!revisionResponse.ok || !revisionId) {
    throw new Error(generatedDrawingError(revisionBody));
  }
  return revisionId;
}

export async function submitShaftDrawingGeneration(
  projectId: string,
  modelIdentityId: string
): Promise<string> {
  const geometryRevisionId = await ensureCurrentGeometryRevision(projectId, modelIdentityId);
  const response = await fetch("/api/cad/drawings/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, modelIdentityId, geometryRevisionId })
  });
  return readGeneratedDrawingId(response);
}
