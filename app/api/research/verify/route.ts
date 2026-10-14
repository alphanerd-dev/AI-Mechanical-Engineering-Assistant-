import { NextResponse } from "next/server";
import { verifyResearchFinding } from "../../../../src/research/verification";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authorization = await authorizeSupabaseRequest("EVIDENCE.WRITE");
    if (!authorization.allowed) {
      const status = authorizationFailureStatus(authorization); return NextResponse.json({ error: authorization.reason, code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED" }, { status });
    }

    const body = await request.json();
    const result = verifyResearchFinding({
      finding: body.finding,
      method: body.method,
      verifier: body.verifier,
      notes: body.notes,
      evidenceUri: body.evidenceUri,
    });
    return NextResponse.json(result, { status: result.verified ? 200 : 422 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed." },
      { status: 400 },
    );
  }
}
