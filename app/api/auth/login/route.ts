import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { provisionRoleForAuthenticatedUser } from "../../../../src/auth/role-provisioning";
import { identityFromSupabaseUser } from "../../../../src/auth/supabase-identity";
import { getAuthenticationAuditTrail } from "../../../../src/auth/supabase-service";

export const runtime = "nodejs";

function authFailure(request: Request, isJsonRequest: boolean, status: number, code: string, message: string) {
  if (isJsonRequest) return NextResponse.json({ error: message, code }, { status });
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, request.url), { status: 303 });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isJsonRequest = contentType.includes("application/json");

  try {
    const body = isJsonRequest
      ? await request.json().catch(() => ({}))
      : Object.fromEntries(await request.formData().catch(() => new FormData()));

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return authFailure(request, isJsonRequest, 400, "missing-fields", "Email and password are required.");
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
      return authFailure(request, isJsonRequest, 401, "authentication-failed", "Sign-in failed.");
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
          return authFailure(request, isJsonRequest, 503, "role-provisioning-failed", "Sign-in succeeded, but engineering access could not be provisioned.");
        }
      } catch {
        return authFailure(request, isJsonRequest, 503, "role-provisioning-failed", "Sign-in succeeded, but engineering access could not be provisioned.");
      }
    }

    // Refresh on every successful sign-in, not only when provisioning a new role.
    // Existing app_metadata may be correct in Auth storage while a JWT still has
    // older role claims. Always issue a session whose claims reflect current trusted metadata.
    if (!data.session?.refresh_token) {
      return authFailure(request, isJsonRequest, 503, "role-refresh-required", "Sign-in succeeded, but the session could not be refreshed. Sign in again.");
    }

    try {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: data.session.refresh_token,
      });
      if (refreshError || !refreshed.session) {
        return authFailure(request, isJsonRequest, 503, "role-refresh-required", "Sign-in succeeded, but the session could not be refreshed. Sign in again.");
      }

      const refreshedUser = refreshed.user ?? refreshed.session.user;
      if (!identityFromSupabaseUser(refreshedUser)) {
        return authFailure(request, isJsonRequest, 503, "role-refresh-required", "Your session refreshed, but its trusted engineering role is still missing. Sign in again or contact the administrator.");
      }
    } catch {
      return authFailure(request, isJsonRequest, 503, "role-refresh-required", "Sign-in succeeded, but the session could not be refreshed. Sign in again.");
    }

    getAuthenticationAuditTrail().append({
      timestamp: new Date().toISOString(),
      actor: { subject: data.user.id, actorType: "USER" },
      action: "AUTHENTICATION",
      outcome: "SUCCESS",
      reason: "Supabase authentication succeeded and session was refreshed.",
      metadata: { sessionId: data.user.id },
    });

    // Use 303 so the browser follows the successful POST with a GET to "/".
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  } catch {
    return authFailure(request, isJsonRequest, 503, "auth-unavailable", "Authentication is temporarily unavailable.");
  }
}
