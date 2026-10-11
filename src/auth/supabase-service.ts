import { createClient } from "../../lib/supabase/server";
import { InMemoryAuditTrail } from "../audit/trail";
import { type AuditActor, type AuditAction, type AuditOutcome } from "../audit/types";
import { authorize } from "./policy";
import type { AuthenticatedIdentity, EngineeringPermission } from "./types";
import { identityFromSupabaseClaims, identityFromSupabaseUser, type SupabaseClaims } from "./supabase-identity";

const globalKey = "__ENGINEERING_SUPABASE_AUTH_AUDIT__";
type GlobalWithAudit = typeof globalThis & { [globalKey]?: InMemoryAuditTrail };

function auditTrail() {
  const holder = globalThis as GlobalWithAudit;
  holder[globalKey] ??= new InMemoryAuditTrail();
  return holder[globalKey];
}

function actorType(identity: AuthenticatedIdentity): AuditActor["actorType"] {
  return identity.roles.includes("AGENT") ? "AGENT" : "USER";
}

function audit(
  action: AuditAction,
  outcome: AuditOutcome,
  subject: string,
  reason: string,
  metadata: Record<string, unknown>,
  identity?: AuthenticatedIdentity,
) {
  auditTrail()?.append({
    timestamp: new Date().toISOString(),
    actor: {
      subject,
      actorType: identity ? actorType(identity) : "SYSTEM",
      roles: identity?.roles,
    },
    action,
    outcome,
    reason,
    metadata,
  });
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = !error && data?.claims ? data.claims as SupabaseClaims : undefined;

  // Fast path: validate the signed JWT and use its trusted app_metadata role claims.
  const claimsIdentity = claims ? identityFromSupabaseClaims(claims) : null;
  if (claimsIdentity) return claimsIdentity;

  // Recovery path: an access token can be older than the server-managed user role.
  // Ask Supabase Auth to validate the current session and return the current user
  // record, then build identity only from that verified user's app_metadata.
  // If Auth cannot validate the session or no trusted role exists, deny by default.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  return identityFromSupabaseUser(userData.user, claims);
}

export async function authorizeSupabaseRequest(
  permission: EngineeringPermission,
  projectId?: string,
) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    const decision = {
      allowed: false,
      reason: "Authenticated engineering identity is missing or has no assigned engineering role.",
      permission,
      subject: "anonymous",
      projectId,
    };
    audit("AUTHORIZATION", "DENIED", "anonymous", decision.reason, { permission, projectId });
    return decision;
  }

  const decision = authorize({ identity, permission, projectId });
  audit(
    "AUTHORIZATION",
    decision.allowed ? "ALLOWED" : "DENIED",
    identity.subject,
    decision.reason,
    { permission, projectId, sessionId: identity.sessionId ?? "unknown" },
    identity,
  );
  return decision;
}

export function getAuthenticationAuditTrail() {
  return auditTrail();
}
