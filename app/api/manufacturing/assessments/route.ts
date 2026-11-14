import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { parseManufacturingReadinessRequest } from "../../../../lib/manufacturing/readiness-request-schema";
import { createManufacturingAssessment, readManufacturingAssessmentHistory } from "../../../../lib/manufacturing/assessment-service";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function authorizationStatus(reason: string) {
  return reason.includes("unavailable") ? 503 : 403;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const body = parseManufacturingReadinessRequest(await request.json());
    if (!body) return fail("Manufacturing readiness input is incomplete or malformed.", 400);
    const projectId = body.processPlan.projectId;
    const authorization = await authorizeSupabaseRequest("EVIDENCE.WRITE", projectId, { requestId });
    if (!authorization.allowed) return fail(authorization.reason, authorizationStatus(authorization.reason));
    const sessionDb = await createClient();
    const { data: identity, error } = await sessionDb.auth.getUser();
    if (error) return fail("Authenticated project identity could not be confirmed.", 401);
    if (!identity.user) return fail("Authenticated project identity could not be confirmed.", 401);
    if (identity.user.id !== authorization.subject) return fail("Authenticated project identity could not be confirmed.", 401);
    return createManufacturingAssessment({ body, actorId: identity.user.id, requestId });
  } catch {
    return fail("Manufacturing readiness assessment failed without reporting success.", 503);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const releaseId = url.searchParams.get("releaseId");
    if (!isUuid(projectId)) return fail("A valid projectId query parameter is required.", 400);
    if (!releaseId) return fail("A releaseId query parameter is required.", 400);
    const authorization = await authorizeSupabaseRequest("EVIDENCE.READ", projectId, { requestId: randomUUID() });
    if (!authorization.allowed) return fail(authorization.reason, authorizationStatus(authorization.reason));
    return readManufacturingAssessmentHistory(projectId, releaseId);
  } catch {
    return fail("Manufacturing assessment history could not be read.", 503);
  }
}
