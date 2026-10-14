import { NextResponse } from "next/server";
import { authorizeSupabaseRequest, authorizationFailureStatus } from "../../../../src/auth/supabase-service";
import {
  DurableAuditIntegrityError,
  DurableAuditPersistenceError,
  readEngineeringAuditEvents,
} from "../../../../src/audit/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  if (!projectId || !UUID.test(projectId)) {
    return NextResponse.json({ error: "A valid projectId is required." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }

  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? 100 : Number(rawLimit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    return NextResponse.json({ error: "limit must be an integer between 1 and 200." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }

  let authorization;
  try {
    authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
  } catch {
    return NextResponse.json({ error: "Authorization service is unavailable." }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  if (!authorization.allowed) {
    const status = authorizationFailureStatus(authorization);
    return NextResponse.json({
      error: authorization.reason,
      code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED",
    }, { status, headers: { "cache-control": "no-store" } });
  }

  try {
    const result = await readEngineeringAuditEvents(projectId, parsedLimit);
    return NextResponse.json({
      projectId,
      events: result.events,
      chainIntegrity: result.chainIntegrity,
      verified: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DurableAuditIntegrityError) {
      return NextResponse.json({
        error: "Durable engineering audit integrity verification failed.",
        code: "AUDIT_INTEGRITY_FAILURE",
        verified: false,
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (error instanceof DurableAuditPersistenceError) {
      return NextResponse.json({
        error: "Durable engineering audit storage is unavailable.",
        code: "AUDIT_STORE_UNAVAILABLE",
        verified: false,
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({
      error: "Durable engineering audit could not be verified.",
      code: "AUDIT_VERIFICATION_UNAVAILABLE",
      verified: false,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
