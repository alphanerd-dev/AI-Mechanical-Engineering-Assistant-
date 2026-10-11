import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { provisionRoleForAuthenticatedUser } from "../../../../src/auth/role-provisioning";
import { getAuthenticationAuditTrail } from "../../../../src/auth/supabase-service";

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

    const appMetadata = data.user.app_metadata ?? {};
    const existingRoles = appMetadata.engineering_roles ?? appMetadata.engineering_role;
    const roleToProvision = provisionRoleForAuthenticatedUser({
      userId: data.user.id,
      existingRoles,
      bootstrapAdminUserId: process.env.BOOTSTRAP_ADMIN_USER_ID,
    });

    if (roleToProvision) {
      try {
        const admin = createServiceRoleClient();
        const { error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
          app_metadata: {
            ...appMetadata,
            engineering_roles: [roleToProvision],
          },
        });
        if (roleError) {
          return NextResponse.json(
            { error: "Sign-in succeeded, but engineering access could not be provisioned. Please try again or contact the platform administrator." },
            { status: 503 },
          );
        }

        if (!data.session?.refresh_token) {
          return NextResponse.json(
            { error: "Engineering access was provisioned. Sign out and sign in again to refresh your session." },
            { status: 503 },
          );
        }
        const { error: refreshError } = await supabase.auth.refreshSession({
          refresh_token: data.session.refresh_token,
        });
        if (refreshError) {
          return NextResponse.json(
            { error: "Engineering access was provisioned. Sign out and sign in again to refresh your session." },
            { status: 503 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Sign-in succeeded, but engineering access could not be provisioned. Please try again or contact the platform administrator." },
          { status: 503 },
        );
      }
    }

    getAuthenticationAuditTrail().append({
      timestamp: new Date().toISOString(),
      actor: { subject: data.user.id, actorType: "USER" },
      action: "AUTHENTICATION",
      outcome: "SUCCESS",
      reason: "Supabase authentication succeeded.",
      metadata: { sessionId: data.session?.user?.id ?? "supabase-session" },
    });

    // Use 303 so the browser follows the successful POST with a GET to "/".
    // A 307 preserves POST and can cause the home page to return HTTP 405.
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication is not configured." },
      { status: 503 },
    );
  }
}
