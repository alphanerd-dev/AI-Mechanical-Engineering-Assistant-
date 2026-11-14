import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { parseManufacturingDecisionRequest } from "../../../../lib/manufacturing/decision-request-schema";
import { submitManufacturingDecision } from "../../../../lib/manufacturing/decision-service";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function authorizationStatus(reason: string) {
  return reason.includes("unavailable") ? 503 : 403;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const input = parseManufacturingDecisionRequest(await request.json());
    if (!input) return fail("A valid projectId, assessmentId, decision and optional comment are required.", 400);
    const authorization = await authorizeSupabaseRequest("APPROVAL.GRANT", input.projectId, { requestId, taskId: input.assessmentId });
    if (!authorization.allowed) return fail(authorization.reason, authorizationStatus(authorization.reason));
    const sessionDb = await createClient();
    const { data: identity, error } = await sessionDb.auth.getUser();
    if (error) return fail("Authenticated approver identity could not be confirmed.", 401);
    if (!identity.user) return fail("Authenticated approver identity could not be confirmed.", 401);
    if (identity.user.id !== authorization.subject) return fail("Authenticated approver identity could not be confirmed.", 401);
    return submitManufacturingDecision({ request: input, actorId: identity.user.id, requestId });
  } catch {
    return fail("Manufacturing human decision failed without reporting success.", 503);
  }
}
