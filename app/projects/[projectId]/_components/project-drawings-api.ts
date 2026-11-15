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

export async function submitShaftDrawingGeneration(
  projectId: string,
  modelIdentityId: string
): Promise<string> {
  const response = await fetch("/api/cad/drawings/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, modelIdentityId })
  });
  return readGeneratedDrawingId(response);
}
