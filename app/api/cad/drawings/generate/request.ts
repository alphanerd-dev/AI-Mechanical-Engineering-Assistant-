import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../../src/auth/supabase-service";

export const MAX_DRAWING_GENERATION_REQUEST_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
export type DrawingGenerationInput = {
  projectId: string; modelIdentityId: string; geometryRevisionId: string;
  drawingNumber?: string; title?: string;
};
export interface DrawingGenerationFailure {
  message: string; status: number; code?: string;
}
export class DrawingGenerationError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(input: DrawingGenerationFailure) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.name = "DrawingGenerationError";
  }
}
export function fail(input: DrawingGenerationFailure): never {
  throw new DrawingGenerationError(input);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DRAWING_GENERATION_REQUEST_BYTES) {
    fail("Drawing generation request exceeds 16 KiB.", 413, "REQUEST_TOO_LARGE");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_DRAWING_GENERATION_REQUEST_BYTES) fail("Drawing generation request exceeds 16 KiB.", 413, "REQUEST_TOO_LARGE");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("Drawing generation request must be valid UTF-8 JSON.", 400, "INVALID_JSON"); }
}
function requiredUuid(input: { body: Record<string, unknown>; field: string }): string {
  const value = input.body[input.field];
  if (typeof value !== "string" || !UUID.test(value)) fail({ message: "A valid " + input.field + " is required.", status: 400, code: "INVALID_IDENTITY" });
  return value;
}
function optionalLabel(input: { body: Record<string, unknown>; field: string; maximum: number }): string | undefined {
  const value = input.body[input.field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail({ message: input.field + " must be a string.", status: 400, code: "INVALID_LABEL" });
  if (value.length > maximum) fail({ message: input.field + " exceeds its maximum length.", status: 400, code: "INVALID_LABEL" });
  return value;
}
export async function parseDrawingGenerationRequest(request: Request): Promise<DrawingGenerationInput> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) fail("Drawing generation request must be a JSON object.", 400, "INVALID_JSON");
  return {
    projectId: requiredUuid({ body, field: "projectId" }),
    modelIdentityId: requiredUuid({ body, field: "modelIdentityId" }),
    geometryRevisionId: requiredUuid({ body, field: "geometryRevisionId" }),
    drawingNumber: optionalLabel({ body, field: "drawingNumber", maximum: 80 }),
    title: optionalLabel({ body, field: "title", maximum: 120 })
  };
}
async function resolveProjectAuthorization(projectId: string) {
  try { return await authorizeSupabaseRequest("TASK.EXECUTE", projectId); }
  catch { fail("Project authorization is unavailable.", 503, "AUTHORIZATION_UNAVAILABLE"); }
}
async function confirmSessionIdentity(subject: string) {
  const sessionDb = await createClient();
  const user = await sessionDb.auth.getUser();
  if (user.error) fail("Authenticated project identity could not be confirmed.", 401, "SESSION_IDENTITY_MISMATCH");
  if (!user.data.user) fail("Authenticated project identity could not be confirmed.", 401, "SESSION_IDENTITY_MISMATCH");
  if (user.data.user.id !== subject) fail("Authenticated project identity could not be confirmed.", 401, "SESSION_IDENTITY_MISMATCH");
  return sessionDb;
}
export async function requireAuthorizedIdentity(projectId: string) {
  const authorization = await resolveProjectAuthorization(projectId);
  if (!authorization.allowed) fail(authorization.reason, authorizationFailureStatus(authorization), "PROJECT_ACCESS_DENIED");
  if (!authorization.subject) fail("Authenticated project identity is unavailable.", 503, "IDENTITY_UNAVAILABLE");
  const sessionDb = await confirmSessionIdentity(authorization.subject);
  return { subject: authorization.subject, sessionDb };
}
export function drawingGenerationErrorResponse(error: unknown): NextResponse {
  if (error instanceof DrawingGenerationError) {
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, {
      status: error.status, headers: { "cache-control": "no-store" }
    });
  }
  return NextResponse.json({ error: "CAD drawing generation failed without changing geometry validation or approval state." }, {
    status: 500, headers: { "cache-control": "no-store" }
  });
}
