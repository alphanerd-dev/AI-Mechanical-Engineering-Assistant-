import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../../../lib/supabase/service";
import { fail, parseDrawingGenerationRequest, requireAuthorizedIdentity, drawingGenerationErrorResponse } from "./request";
import { loadCurrentGeometryRevision, loadAcceptedShaftSource } from "./source";
import { persistGeneratedDrawing } from "./persistence";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AuthorizedDrawingRequest {
  projectId: string;
  modelIdentityId: string;
  geometryRevisionId?: string;
  drawingNumber?: string;
  title?: string;
  subject: string;
  sessionDb: Awaited<ReturnType<typeof import("../../../../../lib/supabase/server").createClient>>;
}
function defaultDrawingNumber(revision: Record<string, unknown>): string {
  const number = Number(revision.revision_number);
  const id = String(revision.id).slice(0, 8).toUpperCase();
  return "SHAFT-" + number + "-" + id;
}
function defaultDrawingTitle(revision: Record<string, unknown>): string {
  return "Shaft — Geometry Revision " + Number(revision.revision_number);
}
async function requireProjectModel(input: AuthorizedDrawingRequest): Promise<void> {
  const serviceDb = createServiceRoleClient();
  const model = await serviceDb.from("engineering_cad_models").select("id")
    .eq("id", input.modelIdentityId).eq("project_id", input.projectId).maybeSingle();
  if (model.error || !model.data) {
    fail({ message: "CAD model identity does not belong to this project.", status: 404, code: "MODEL_NOT_FOUND" });
  }
}
async function generateForAcceptedRevision(input: AuthorizedDrawingRequest) {
  const serviceDb = createServiceRoleClient();
  const revision = await loadCurrentGeometryRevision(serviceDb, input);
  const source = await loadAcceptedShaftSource({
    serviceDb,
    revision,
    projectId: input.projectId,
    modelIdentityId: input.modelIdentityId
  });
  const drawingNumber = input.drawingNumber?.trim() || defaultDrawingNumber(revision);
  const title = input.title?.trim() || defaultDrawingTitle(revision);
  return persistGeneratedDrawing({
    serviceDb,
    sessionDb: input.sessionDb,
    subject: input.subject,
    projectId: input.projectId,
    modelIdentityId: input.modelIdentityId,
    revision,
    drawingNumber,
    title,
    diameterMm: source.diameterMm,
    lengthMm: source.lengthMm
  });
}
async function executeAuthorizedDrawingRequest(input: AuthorizedDrawingRequest) {
  await requireProjectModel(input);
  return generateForAcceptedRevision(input);
}
export async function POST(request: Request) {
  try {
    const parsed = await parseDrawingGenerationRequest(request);
    const authorization = await requireAuthorizedIdentity({ projectId: parsed.projectId });
    const drawing = await executeAuthorizedDrawingRequest({
      ...parsed,
      subject: authorization.subject,
      sessionDb: authorization.sessionDb
    });
    const status = drawing.idempotentReplay ? 200 : 201;
    return NextResponse.json({ drawing }, { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return drawingGenerationErrorResponse(error);
  }
}
