import { fail } from "./errors";

export const MAX_DRAWING_GENERATION_REQUEST_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DrawingGenerationInput = {
  projectId: string;
  modelIdentityId: string;
  geometryRevisionId?: string;
  drawingNumber?: string;
  title?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DRAWING_GENERATION_REQUEST_BYTES) {
    fail({ message: "Drawing generation request exceeds 16 KiB.", status: 413, code: "REQUEST_TOO_LARGE" });
  }
  if (!request.body) {
    fail({ message: "Drawing generation request body is required.", status: 400, code: "INVALID_JSON" });
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      totalBytes += part.value.byteLength;
      if (totalBytes > MAX_DRAWING_GENERATION_REQUEST_BYTES) {
        await reader.cancel();
        fail({ message: "Drawing generation request exceeds 16 KiB.", status: 413, code: "REQUEST_TOO_LARGE" });
      }
      chunks.push(new Uint8Array(part.value));
    }
  } catch (error) {
    if (error instanceof Error && error.name === "DrawingGenerationError") throw error;
    fail({ message: "Drawing generation request body could not be read.", status: 400, code: "INVALID_JSON" });
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail({ message: "Drawing generation request must be valid UTF-8 JSON.", status: 400, code: "INVALID_JSON" });
  }
}

function requiredUuid(input: { body: Record<string, unknown>; field: string }): string {
  const value = input.body[input.field];
  if (typeof value !== "string" || !UUID.test(value)) {
    fail({ message: "A valid " + input.field + " is required.", status: 400, code: "INVALID_IDENTITY" });
  }
  return value;
}

function optionalLabel(input: { body: Record<string, unknown>; field: string; maximum: number }): string | undefined {
  const value = input.body[input.field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    fail({ message: input.field + " must be a string.", status: 400, code: "INVALID_LABEL" });
  }
  if (value.length > input.maximum) {
    fail({ message: input.field + " exceeds its maximum length.", status: 400, code: "INVALID_LABEL" });
  }
  return value;
}

export async function parseDrawingGenerationRequest(request: Request): Promise<DrawingGenerationInput> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    fail({ message: "Drawing generation request must be a JSON object.", status: 400, code: "INVALID_JSON" });
  }
  return {
    projectId: requiredUuid({ body, field: "projectId" }),
    modelIdentityId: requiredUuid({ body, field: "modelIdentityId" }),
    ...(body.geometryRevisionId === undefined
      ? {}
      : { geometryRevisionId: requiredUuid({ body, field: "geometryRevisionId" }) }),
    drawingNumber: optionalLabel({ body, field: "drawingNumber", maximum: 80 }),
    title: optionalLabel({ body, field: "title", maximum: 120 })
  };
}
