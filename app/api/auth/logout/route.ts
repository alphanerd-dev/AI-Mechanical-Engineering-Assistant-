import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicUrl } from "../../../../lib/http/public-origin";
import { getAuthenticatedIdentity, getAuthenticationAuditTrail } from "../../../../src/auth/supabase-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await getAuthenticatedIdentity();
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (identity) {
      getAuthenticationAuditTrail().append({
        timestamp: new Date().toISOString(),
        actor: { subject: identity.subject, actorType: identity.roles.includes("AGENT") ? "AGENT" : "USER", roles: identity.roles },
        action: "SYSTEM_EVENT",
        outcome: error ? "FAILURE" : "SUCCESS",
        reason: error ? "Supabase sign-out failed." : "Supabase sign-out succeeded.",
        metadata: { sessionId: identity.sessionId ?? "unknown" },
      });
    }

    if (error) return NextResponse.json({ error: "Sign out failed." }, { status: 500 });
    return NextResponse.redirect(getPublicUrl("/login", request), { status: 303 });
  } catch {
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 503 },
    );
  }
}
