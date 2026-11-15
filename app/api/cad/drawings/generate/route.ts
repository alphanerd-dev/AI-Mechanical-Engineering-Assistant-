import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../../../lib/supabase/service";
import { fail, parseDrawingGenerationRequest, requireAuthorizedIdentity, drawingGenerationErrorResponse } from "./request";
import { loadCurrentGeometryRevision, loadAcceptedShaftSource } from "./source";
import { persistGeneratedDrawing } from "./persistence";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const input = await parseDrawingGenerationRequest(request);
    const { subject, sessionDb } = await requireAuthorizedIdentity({ projectId: input.projectId });
    const serviceDb = createServiceRoleClient();
    const model = await serviceDb.from("engineering_cad_models").select("id")
      .eq("id", input.modelIdentityId).eq("project_id", input.projectId).maybeSingle();
    if (model.error || !model.data) fail({ message: "CAD model identity does not belong to this project.", status: 404, code: "MODEL_NOT_FOUND" });

    const revision = await loadCurrentGeometryRevision(serviceDb, input);
    const source = await loadAcceptedShaftSource({ serviceDb, revision, projectId: input.projectId, modelIdentityId: input.modelIdentityId });
    const revisionNumber = Number(revision.revision_number);
    const drawingNumber = input.drawingNumber?.trim() || "SHAFT-" + revisionNumber + "-" + String(revision.id).slice(0, 8).toUpperCase();
    const title = input.title?.trim() || "Shaft — Geometry Revision " + revisionNumber;
    const drawing = await persistGeneratedDrawing({
      serviceDb, sessionDb, subject,
      projectId: input.projectId, modelIdentityId: input.modelIdentityId,
      revision, drawingNumber, title,
      diameterMm: source.diameterMm, lengthMm: source.lengthMm
    });
    return NextResponse.json({ drawing }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return drawingGenerationErrorResponse(error);
  }
}
