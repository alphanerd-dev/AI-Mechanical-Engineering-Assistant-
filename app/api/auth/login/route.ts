import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server.js";
import { getAuthenticationAuditTrail } from "../../../../src/auth/supabase-service.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await request.json().catch(() => ({}))
      : Object.fromEntries(await request.formData().catch(() => new FormData()));

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      getAuthenticationAuditTrail().append({
        timestamp: new Date().toISOString(),
        actor: { subject: "anonymous", actorType: "SYSTEM" },
        action: "AUTHENTICATION",
        outcome: "DENIED",
        reason: "Supabase authentication failed.",
        metadata: { email },
      });
      return NextResponse.json({ error: "Authentication failed." }, { status: 401 });
    }

    getAuthenticationAuditTrail().append({
      timestamp: new Date().toISOString(),
      actor: { subject: data.user.id, actorType: "USER" },
      action: "AUTHENTICATION",
      outcome: "SUCCESS",
      reason: "Supabase authentication succeeded.",
      metadata: { sessionId: data.session?.user?.id ?? "supabase-session" },
    });

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication is not configured." },
      { status: 503 },
    );
  }
}
